# System design sandbox

An interactive browser app for sketching simple distributed systems and watching **illustrative** traffic flow through them. Drag building blocks onto a canvas, connect them with edges, tune capacities and load, then run a lightweight simulation to see throughput, drops, latency-style hints, utilization, and rough “cost” numbers.

**Try it in the browser (no install):** [https://system-design-sandbox-three.vercel.app/](https://system-design-sandbox-three.vercel.app/)

This is a **teaching toy**, not a production capacity planner or billing estimate.

## What you can do

- **Build a diagram** using a palette of common roles: client, load balancer, API, cache, message queue, database, CDN, and object storage.
- **Connect nodes** by dragging from one handle to another to define how traffic can move.
- **Run or step the simulation** with configurable tick interval and global offered load (RPS). Traffic is modeled as entering through **client** nodes and propagating along edges, subject to each component’s capacity.
- **Inspect and edit** a selected node or edge in the side panel (simulation-related fields appear when something is selected).
- **Persist work locally**: the diagram autosaves in `localStorage` for this browser.
- **Export and import JSON** to share diagrams or keep backups.
- **Load a sample** diagram or **clear the canvas** from the header.
- **Delete** selected nodes or edges with Backspace/Delete, or drag a node onto the on-canvas trash target.
- Use the **mini map** and **fit view** for navigation on larger diagrams.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router)
- [React](https://react.dev/)
- [@xyflow/react](https://reactflow.dev/) (React Flow) for the canvas
- [Zustand](https://github.com/pmndrs/zustand) for application state
- [Tailwind CSS](https://tailwindcss.com/) for styling

## Local development

Prerequisites: [Node.js](https://nodejs.org/) (version compatible with the project’s `package.json`).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The main UI lives in `components/design/`; simulation logic is under `lib/sim/`.

## Build

```bash
npm run build
npm start
```

## Lint

```bash
npm run lint
```

## Deploy

The live demo is hosted on [Vercel](https://vercel.com/). You can deploy your own fork with the [Next.js deployment guide](https://nextjs.org/docs/app/building-your-application/deploying).
