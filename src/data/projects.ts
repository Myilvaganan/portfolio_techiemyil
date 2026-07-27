import type { Project } from '@/types'
import devconnector from '@/assets/images/project-devconnector.jpg'
import greenEvents from '@/assets/images/project-green-events.jpg'
import floraShop from '@/assets/images/project-flora-shop.jpg'
import netflixClone from '@/assets/images/project-netflix-clone.jpg'

export const projects: Project[] = [
  {
    id: 'devconnector',
    title: 'DevConnector',
    tagline: 'Developer Social Platform',
    description:
      'A full-stack social networking platform for developers built on the MERN stack, enabling profile creation, GitHub integration, and community features. Implements JWT-based authentication, profile CRUD, and a real-time post feed with likes and comments.',
    stack: ['MongoDB', 'Express.js', 'React.js', 'Node.js', 'Redux', 'JWT', 'Heroku'],
    github: 'https://github.com/Myilvaganan',
    image: devconnector,
    featured: true,
    category: 'Full Stack',
  },
  {
    id: 'green-events',
    title: 'Green Events',
    tagline: 'Environmental Event Platform',
    description:
      'A Next.js SSR platform for posting and discovering environmental community events, powered by Strapi headless CMS. Built with server-side rendering for SEO, dynamic routing, and optimised image delivery.',
    stack: ['React.js', 'Next.js', 'Node.js', 'Strapi', 'Vercel'],
    github: 'https://github.com/Myilvaganan',
    image: greenEvents,
    featured: true,
    category: 'Full Stack',
  },
  {
    id: 'flora-shop',
    title: 'E-Commerce Flora Shop',
    tagline: 'MERN E-Commerce App',
    description:
      'A full-featured e-commerce platform for buying and selling plants with product listings, cart management, authentication, and order tracking. RESTful APIs built with Express.js and an intuitive React.js storefront with Redux state management.',
    stack: ['MongoDB', 'Express.js', 'React.js', 'Node.js', 'Redux', 'Stripe', 'Heroku'],
    github: 'https://github.com/Myilvaganan',
    image: floraShop,
    featured: true,
    category: 'E-commerce',
  },
  {
    id: 'netflix-clone',
    title: 'Netflix Clone',
    tagline: 'React.js Streaming UI',
    description:
      'A pixel-accurate Netflix UI clone integrating The Movie Database (TMDB) API, featuring dynamic movie categories, banner trailers, and a fully responsive layout.',
    stack: ['React.js', 'TMDB API', 'CSS3'],
    github: 'https://github.com/Myilvaganan',
    image: netflixClone,
    featured: true,
    category: 'Frontend',
  },
]
