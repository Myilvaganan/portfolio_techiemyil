export interface Testimonial {
  id: string
  name: string
  role: string
  initials: string
  quote: string
}

export const testimonials: Testimonial[] = [
  {
    id: 'manish-thakur',
    name: 'Manish Thakur',
    role: 'Senior Software Engineer · Python Developer',
    initials: 'MT',
    quote:
      'I had the pleasure of working alongside Myil, and he truly stands out as a skilled MERN stack developer. His expertise in JavaScript, Node.js, React, and Python helped us build scalable and efficient solutions together. Beyond his technical strengths, he is collaborative, proactive, and always eager to tackle challenges with smart problem-solving. Myil is an excellent teammate and would be a great asset to any organization.',
  },
  {
    id: 'bhavana-ramesh',
    name: 'Bhavana Ramesh',
    role: 'Business Analyst at Amazon',
    initials: 'BR',
    quote:
      'I had the opportunity to work with Myil in the Amazon Rewards team and was consistently impressed by his exceptional problem-solving skills and ability to remain calm under pressure. He demonstrates strong product knowledge and approaches every challenge with patience and clarity. During critical situations, often at odd hours, Myil has shown remarkable dedication by stepping in to resolve complex issues effectively. His professionalism, commitment, and resilience make him a dependable colleague and someone with strong leadership potential.',
  },
]
