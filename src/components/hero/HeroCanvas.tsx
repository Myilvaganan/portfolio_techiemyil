import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'

function ParticleField() {
  return (
    <Sparkles
      count={70}
      scale={[6, 6, 4]}
      size={2.2}
      speed={0.25}
      opacity={0.55}
      color="#4ADE80"
      noise={1.2}
    />
  )
}

export function HeroCanvas() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <ParticleField />
        </Suspense>
      </Canvas>
    </div>
  )
}
