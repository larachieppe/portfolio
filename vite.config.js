import { defineConfig } from "vite";

// The dev server is served from "/", but the built site defaults to a GitHub
// Pages project path (https://user.github.io/portfolio/). Note that `command`
// is "serve" for BOTH dev and preview, so `isPreview` is what distinguishes
// them — without it, `npm run preview` would serve the built HTML (which
// references /portfolio/assets/...) from "/" and every asset would 404.
// Override with BASE=/ for a root deploy such as Netlify, Vercel, or a
// custom domain.
export default defineConfig(({ command, isPreview }) => {
  const isDevServer = command === "serve" && !isPreview;
  return {
    base: isDevServer ? "/" : process.env.BASE ?? "/portfolio/",
    server: { port: 5178 },
    preview: { port: 5179 },
    build: { outDir: "dist", assetsInlineLimit: 0 },
  };
});
