import { createFileRoute } from "@tanstack/react-router";

import { NotFoundPage } from "../components/app/NotFoundPage";

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Page not found — IRONVAULT Gym Management" },
      { name: "description", content: "The requested IRONVAULT page could not be found." },
    ],
  }),
  component: NotFoundPage,
});
