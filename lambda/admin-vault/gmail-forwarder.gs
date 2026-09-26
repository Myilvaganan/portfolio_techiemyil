/**
 * Sends bank statement PDFs from my Gmail to the admin vault.
 *
 * Setup (one time, about two minutes):
 *  1. Go to https://script.google.com, click "New project", and paste this whole file over the sample code.
 *  2. Project Settings (gear icon) -> Script properties -> Add: name INGEST_KEY, value = the key you were given.
 *  3. Pick "install" in the function list at the top and click Run. Approve the permissions when Google asks
 *     (it needs to read Gmail and call the vault). This makes the script run every 6 hours by itself.
 *  4. Optional: pick "forwardStatements" and click Run to send anything already in your inbox right now.
 *
 * What it does: it looks for emails from the banks below that have a PDF attached, sends each PDF to the vault,
 * and puts the label "statements-imported" on the email so it is never sent twice. Nothing else in Gmail is touched.
 * The key can only add PDFs to the vault's inbox; it cannot read anything back.
 */

var ENDPOINT = 'https://uie2mufwti.execute-api.ap-south-1.amazonaws.com/ingest/statement'
var LABEL = 'statements-imported'
var SENDERS = ['icici.bank.in', 'icicibank.com', 'axis.bank.in', 'axisbank.com']
var LOOKBACK = 'newer_than:60d'
var MAX_BYTES = 4000000

function forwardStatements() {
  var key = PropertiesService.getScriptProperties().getProperty('INGEST_KEY')
  if (!key) throw new Error('Add the INGEST_KEY script property first (Project Settings -> Script properties).')

  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL)
  var query = 'from:(' + SENDERS.join(' OR ') + ') has:attachment filename:pdf ' + LOOKBACK + ' -label:' + LABEL
  var threads = GmailApp.search(query, 0, 25)
  var sent = 0

  threads.forEach(function (thread) {
    var allSent = true
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        var isPdf = att.getContentType() === 'application/pdf' || /\.pdf$/i.test(att.getName())
        if (!isPdf || att.getSize() > MAX_BYTES) return
        var res = UrlFetchApp.fetch(ENDPOINT, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ingest-key': key },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            filename: att.getName(),
            from: msg.getFrom(),
            subject: msg.getSubject(),
            messageId: msg.getId(),
            receivedAt: msg.getDate().toISOString(),
            pdfBase64: Utilities.base64Encode(att.getBytes()),
          }),
        })
        var code = res.getResponseCode()
        if (code >= 200 && code < 300) sent++
        else allSent = false
      })
    })
    // Only mark the email done when every attachment reached the vault; a failure is retried on the next run.
    if (allSent) thread.addLabel(label)
  })

  console.log('Sent ' + sent + ' PDF(s) from ' + threads.length + ' email(s).')
}

/** Run once: makes forwardStatements run every 6 hours. */
function install() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'forwardStatements') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('forwardStatements').timeBased().everyHours(6).create()
  console.log('Installed: forwardStatements will run every 6 hours.')
}
