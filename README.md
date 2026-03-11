# GymAppJP (OmniCoach OS)

GymAppJP (also known as OmniCoach OS) is an advanced web application designed to empower gym coaches, personal trainers, and fitness professionals. It provides a comprehensive suite of tools to manage clients, build customized workout and nutrition plans, track progress, and operate under a professional white-label experience.

## 🚀 Features

- **Workout Builder:** Create professional routines using a catalog of 230+ exercises, each with animated GIFs and instructions.
- **Nutrition Plans:** Assign personalized meal plans to each client. Clients can log their daily food intake.
- **Check-ins & Progress Tracking:** Clients can upload progress photos and log their weight/measurements.
- **White-Label App:** A branded PWA experience that clients can install on their smartphones.
- **Coach Dashboard:** Manage all active clients, track their engagement, and handle subscriptions in one place.
- **Multilingual Support:** English and Spanish interfaces.
- **Dark & Light Themes:** First-class support for system preferences and manual theme toggling.

## 🛠️ Tech Stack

- **Framework:** Next.js 15+ (App Router, React Server Components)
- **Styling:** Tailwind CSS + Shadcn UI + Framer Motion
- **Database & Auth:** Supabase (PostgreSQL, Auth, Storage)
- **PWA Support:** next-pwa

## 🏃‍♂️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm, yarn, pnpm, or bun
- A Supabase project

### 1. Clone & Install
```bash
git clone https://github.com/Juancho2706/gymappjp.git
cd gymappjp
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the root of the project with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

## 📚 Learn More

- Learn about the [Next.js App Router](https://nextjs.org/docs/app).
- Explore the [Supabase Documentation](https://supabase.com/docs).
- Learn about [Shadcn UI](https://ui.shadcn.com/).

## 📝 License

This project is licensed under the MIT License.
