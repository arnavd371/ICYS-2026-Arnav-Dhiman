"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type Optimizer = "fixed" | "adam" | "rmsprop" | "adagrad";
type Landscape = "narrow-valley" | "multimodal" | "flat-saddle" | "mixed";
type Goal = "fast-escape" | "balanced" | "baseline";
type Benchmark = "himmelblau" | "rosenbrock" | "ackley";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const himmelblau = (x: number, y: number) =>
  Math.pow(x * x + y - 11, 2) + Math.pow(x + y * y - 7, 2);

const rosenbrock = (x: number, y: number) => {
  const a = 1;
  const b = 100;
  return Math.pow(a - x, 2) + b * Math.pow(y - x * x, 2);
};

const ackley = (x: number, y: number) => {
  const sumSq = 0.5 * (x * x + y * y);
  const sumCos = 0.5 * (Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y));
  return -20 * Math.exp(-0.2 * Math.sqrt(sumSq)) - Math.exp(sumCos) + Math.E + 20;
};

const numericGradient = (fn: (x: number, y: number) => number, x: number, y: number) => {
  const h = 1e-3;
  return {
    gx: (fn(x + h, y) - fn(x - h, y)) / (2 * h),
    gy: (fn(x, y + h) - fn(x, y - h)) / (2 * h),
  };
};

const benchmarks: Record<
  Benchmark,
  {
    label: string;
    range: [number, number];
    start: { x: number; y: number };
    escapeRadius: number;
    maxSteps: number;
    fn: (x: number, y: number) => number;
    grad: (x: number, y: number) => { gx: number; gy: number };
  }
> = {
  himmelblau: {
    label: "Himmelblau",
    range: [-5, 5],
    start: { x: -2.6, y: 1.4 },
    escapeRadius: 4.4,
    maxSteps: 280,
    fn: himmelblau,
    grad: (x, y) => ({
      gx: 4 * x * (x * x + y - 11) + 2 * (x + y * y - 7),
      gy: 2 * (x * x + y - 11) + 4 * y * (x + y * y - 7),
    }),
  },
  rosenbrock: {
    label: "Rosenbrock",
    range: [-2.4, 2.4],
    start: { x: -1.4, y: 1.2 },
    escapeRadius: 2.4,
    maxSteps: 320,
    fn: rosenbrock,
    grad: (x, y) => ({
      gx: -2 * (1 - x) - 400 * x * (y - x * x),
      gy: 200 * (y - x * x),
    }),
  },
  ackley: {
    label: "Ackley",
    range: [-4.5, 4.5],
    start: { x: 2.2, y: -1.6 },
    escapeRadius: 3.2,
    maxSteps: 260,
    fn: ackley,
    grad: (x, y) => numericGradient(ackley, x, y),
  },
};

const benchmarkRows = [
  { fn: "Himmelblau", fixed: "1.0000", adam: "0.3086", rmsprop: "1.0000", adagrad: "0.2525" },
  { fn: "Rosenbrock", fixed: "0.8197", adam: "0.0000", rmsprop: "1.0000", adagrad: "0.0000" },
  { fn: "Ackley", fixed: "0.8929", adam: "0.0000", rmsprop: "1.0000", adagrad: "0.0000" },
];

function FadeSection({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}

export default function Home() {
  const initialBenchmark: Benchmark = "himmelblau";
  const [optimizer, setOptimizer] = useState<Optimizer>("rmsprop");
  const [learningRate, setLearningRate] = useState(0.2);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("Near saddle");
  const [benchmark, setBenchmark] = useState<Benchmark>(initialBenchmark);
  const [path, setPath] = useState<Array<{ x: number; y: number }>>([
    { x: benchmarks[initialBenchmark].start.x, y: benchmarks[initialBenchmark].start.y },
  ]);
  const [landscape, setLandscape] = useState<Landscape>("narrow-valley");
  const [goal, setGoal] = useState<Goal>("fast-escape");
  const [copyState, setCopyState] = useState("Copy");
  const sim = useRef({
    x: benchmarks[initialBenchmark].start.x,
    y: benchmarks[initialBenchmark].start.y,
    mx: 0,
    my: 0,
    vx: 0,
    vy: 0,
    gx2: 0,
    gy2: 0,
    frame: 0,
  });
  const frameRef = useRef<number | null>(null);

  const bibtex = `@article{dhiman2026see,
  title     = {Saddle Escape Efficiency: A Novel Metric to Benchmark Learning Rates in Non-Convex Optimization},
  author    = {Dhiman, Arnav},
  year      = {2026},
  booktitle = {ICCAI 2026}
}`;

  const recommendation = useMemo(() => {
    if (goal === "baseline") {
      return {
        optimizer: "Fixed Learning Rate",
        lr: landscape === "narrow-valley" ? "0.1 to 0.2" : "0.2 to 0.5",
        reason: "Use Fixed LR as a baseline for direct SEE comparisons against adaptive optimizers.",
      };
    }
    if (landscape === "narrow-valley") {
      return {
        optimizer: "RMSProp",
        lr: "0.2 to 0.5",
        reason:
          "RMSProp reached top SEE in narrow valley geometry by adapting quickly along low-curvature directions.",
      };
    }
    if (landscape === "multimodal") {
      return {
        optimizer: "RMSProp",
        lr: "0.2 to 0.5",
        reason: "RMSProp maintained SEE = 1.0 in multimodal benchmarks at higher learning rates.",
      };
    }
    if (landscape === "flat-saddle") {
      return {
        optimizer: goal === "balanced" ? "RMSProp (fallback: Fixed)" : "RMSProp",
        lr: "≥ 0.2",
        reason: "Adaptive variance scaling helps escape flat saddle regions rapidly and consistently.",
      };
    }
    return {
      optimizer: "RMSProp",
      lr: "Start at 0.2, tune to 0.5",
      reason: "For mixed landscapes, begin with the optimizer that maximized SEE across all benchmarks.",
    };
  }, [goal, landscape]);

  const benchmarkConfig = benchmarks[benchmark];

  const surfaceGrid = useMemo(() => {
    const { range, fn } = benchmarkConfig;
    const steps = 64;
    const x: number[] = [];
    const y: number[] = [];
    const span = range[1] - range[0];
    for (let i = 0; i < steps; i += 1) {
      x.push(range[0] + (span * i) / (steps - 1));
      y.push(range[0] + (span * i) / (steps - 1));
    }
    const z = y.map((yVal) => x.map((xVal) => fn(xVal, yVal)));
    return { x, y, z };
  }, [benchmarkConfig]);

  const trail = useMemo(() => {
    const { fn } = benchmarkConfig;
    const x = path.map((point) => point.x);
    const y = path.map((point) => point.y);
    const z = path.map((point) => fn(point.x, point.y));
    return { x, y, z };
  }, [benchmarkConfig, path]);

  const currentPoint = path[path.length - 1] ?? benchmarkConfig.start;
  const currentZ = benchmarkConfig.fn(currentPoint.x, currentPoint.y);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const state = sim.current;
      const { grad, escapeRadius, maxSteps, start } = benchmarks[benchmark];
      const beta1 = 0.9;
      const beta2 = 0.99;
      const rho = 0.92;
      const eps = 1e-7;
      const { gx, gy } = grad(state.x, state.y);

      if (optimizer === "fixed") {
        state.x -= learningRate * gx;
        state.y -= learningRate * gy;
      } else if (optimizer === "adagrad") {
        state.gx2 += gx * gx;
        state.gy2 += gy * gy;
        state.x -= (learningRate / (Math.sqrt(state.gx2) + eps)) * gx;
        state.y -= (learningRate / (Math.sqrt(state.gy2) + eps)) * gy;
      } else if (optimizer === "rmsprop") {
        state.vx = rho * state.vx + (1 - rho) * gx * gx;
        state.vy = rho * state.vy + (1 - rho) * gy * gy;
        state.x -= (learningRate / (Math.sqrt(state.vx) + eps)) * gx;
        state.y -= (learningRate / (Math.sqrt(state.vy) + eps)) * gy;
      } else {
        state.mx = beta1 * state.mx + (1 - beta1) * gx;
        state.my = beta1 * state.my + (1 - beta1) * gy;
        state.vx = beta2 * state.vx + (1 - beta2) * gx * gx;
        state.vy = beta2 * state.vy + (1 - beta2) * gy * gy;
        const t = state.frame + 1;
        const mHatX = state.mx / (1 - Math.pow(beta1, t));
        const mHatY = state.my / (1 - Math.pow(beta1, t));
        const vHatX = state.vx / (1 - Math.pow(beta2, t));
        const vHatY = state.vy / (1 - Math.pow(beta2, t));
        const dampingFactor = Math.hypot(state.x, state.y) < 0.6 ? 0.35 : 1;
        state.x -= (learningRate / (Math.sqrt(vHatX) + eps)) * mHatX * dampingFactor;
        state.y -= (learningRate / (Math.sqrt(vHatY) + eps)) * mHatY * dampingFactor;
      }

      state.frame += 1;
      setStep(state.frame);
      setPath((prev) => [...prev.slice(-180), { x: state.x, y: state.y }]);
      const distance = Math.hypot(state.x - start.x, state.y - start.y);

      if (distance >= escapeRadius) {
        setStatus(`Escaped in ${state.frame} steps`);
        setRunning(false);
        return;
      }
      if (state.frame >= maxSteps) {
        setStatus("Stalled near saddle");
        setRunning(false);
        return;
      }
      setStatus("Traversing saddle");
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [benchmark, learningRate, optimizer, running]);

  useEffect(() => {
    if (!running && frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, [running]);

  const resetSimulation = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setRunning(false);
    const { range, start } = benchmarks[benchmark];
    const jitter = (range[1] - range[0]) * 0.05;
    const seedX = start.x + (Math.random() - 0.5) * jitter;
    const seedY = start.y + (Math.random() - 0.5) * jitter;
    sim.current = {
      x: seedX,
      y: seedY,
      mx: 0,
      my: 0,
      vx: 0,
      vy: 0,
      gx2: 0,
      gy2: 0,
      frame: 0,
    };
    setStep(0);
    setStatus("Near saddle");
    setPath([{ x: seedX, y: seedY }]);
  };

  useEffect(() => {
    resetSimulation();
  }, [benchmark]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bibtex);
      setCopyState("Copied!");
      setTimeout(() => setCopyState("Copy"), 1600);
    } catch {
      setCopyState("Copy failed");
      setTimeout(() => setCopyState("Copy"), 1600);
    }
  };

  return (
    <main className="relative overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-15%] top-[-12%] h-[34rem] w-[34rem] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-[-12%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-[-16%] left-[30%] h-[30rem] w-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <FadeSection id="hero" className="py-32">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-zinc-400">
            ICCAI 2026 · Accepted Paper
          </p>
          <h1 className="max-w-5xl text-4xl font-semibold leading-tight tracking-tight text-zinc-100 md:text-6xl">
            Saddle Escape Efficiency: A Novel Metric to Benchmark Learning Rates in Non-Convex
            Optimization
          </h1>
          <p className="mt-6 text-base text-zinc-300 md:text-lg">Arnav Dhiman · March 7, 2026</p>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-zinc-400">
            A geometry-aware metric for measuring how quickly and reliably optimizers leave saddle
            regions in non-convex landscapes.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href="https://zenodo.org/records/17702989"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/30 transition hover:scale-[1.02]"
            >
              Read Paper
            </a>
            <a
              href="https://zenodo.org/records/17702989"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-zinc-100 backdrop-blur-md transition hover:bg-white/20"
            >
              Download PDF
            </a>
          </div>
        </FadeSection>

        <FadeSection id="abstract" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">Abstract</h2>
          <p className="mt-8 max-w-5xl text-lg leading-8 text-zinc-400 md:text-xl md:leading-9">
            Gradient descent is a foundational optimizer, but in non-convex functions, selecting a
            learning-rate framework that escapes saddle points efficiently remains unresolved. This
            paper introduces <span className="text-emerald-300">Saddle Escape Efficiency (SEE)</span>
            , a dedicated metric that directly evaluates saddle-region escape behavior rather than
            relying on convergence speed or final loss. Through experimental analysis across
            Himmelblau, Rosenbrock, and Ackley benchmarks, we show SEE provides a practical,
            geometry-aware criterion for choosing optimizers more reliably.
          </p>
        </FadeSection>

        <FadeSection id="simulation" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
            Interactive Saddle Escape Simulation
          </h2>
          <p className="mt-6 max-w-4xl text-zinc-400">
            Explore a live 3D landscape and watch a glowing optimizer particle escape the saddle
            geometry across canonical benchmark functions.
          </p>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1.65fr_1fr] lg:items-start">
            <div>
              <div className="relative h-[420px] w-full">
                <Plot
                  data={[
                    {
                      type: "surface",
                      x: surfaceGrid.x,
                      y: surfaceGrid.y,
                      z: surfaceGrid.z,
                      opacity: 0.88,
                      showscale: false,
                      colorscale: [
                        [0, "#0f172a"],
                        [0.25, "#0f766e"],
                        [0.6, "#22d3ee"],
                        [1, "#a7f3d0"],
                      ],
                      contours: {
                        x: { show: true, color: "rgba(52,211,153,0.2)", width: 1 },
                        y: { show: true, color: "rgba(34,211,238,0.2)", width: 1 },
                        z: { show: false },
                      },
                    },
                    {
                      type: "scatter3d",
                      mode: "lines",
                      x: trail.x,
                      y: trail.y,
                      z: trail.z,
                      line: { color: "rgba(52,211,153,0.75)", width: 5 },
                      hoverinfo: "skip",
                    },
                    {
                      type: "scatter3d",
                      mode: "markers",
                      x: [currentPoint.x],
                      y: [currentPoint.y],
                      z: [currentZ],
                      marker: { size: 16, color: "rgba(34,211,238,0.25)" },
                      hoverinfo: "skip",
                    },
                    {
                      type: "scatter3d",
                      mode: "markers",
                      x: [currentPoint.x],
                      y: [currentPoint.y],
                      z: [currentZ],
                      marker: { size: 6, color: "#22d3ee" },
                      hoverinfo: "skip",
                    },
                  ]}
                  layout={{
                    margin: { l: 0, r: 0, t: 0, b: 0 },
                    scene: {
                      xaxis: { visible: false },
                      yaxis: { visible: false },
                      zaxis: { visible: false },
                      bgcolor: "rgba(0,0,0,0)",
                      camera: { eye: { x: 1.35, y: 1.35, z: 0.9 } },
                    },
                    paper_bgcolor: "rgba(0,0,0,0)",
                    plot_bgcolor: "rgba(0,0,0,0)",
                    showlegend: false,
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.24em] text-zinc-400">
                <span>Status · {status}</span>
                <span>Step · {step}</span>
                <span>Surface · {benchmarkConfig.label}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/5 px-4 py-3 backdrop-blur-md">
                <label htmlFor="benchmark" className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-300">
                  Benchmark Function
                </label>
                <select
                  id="benchmark"
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value as Benchmark)}
                  className="mt-3 w-full bg-transparent text-base font-medium text-zinc-100 outline-none"
                >
                  <option value="himmelblau">Himmelblau</option>
                  <option value="rosenbrock">Rosenbrock</option>
                  <option value="ackley">Ackley</option>
                </select>
              </div>
              <div className="rounded-2xl bg-white/5 px-4 py-3 backdrop-blur-md">
                <label htmlFor="optimizer" className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-300">
                  Optimizer
                </label>
                <select
                  id="optimizer"
                  value={optimizer}
                  onChange={(e) => {
                    setOptimizer(e.target.value as Optimizer);
                    resetSimulation();
                  }}
                  className="mt-3 w-full bg-transparent text-base font-medium text-zinc-100 outline-none"
                >
                  <option value="fixed">Fixed</option>
                  <option value="adam">Adam</option>
                  <option value="rmsprop">RMSProp</option>
                  <option value="adagrad">AdaGrad</option>
                </select>
              </div>
              <div className="rounded-2xl bg-white/5 px-4 py-3 backdrop-blur-md">
                <label htmlFor="lr" className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-300">
                  Learning Rate · {learningRate.toFixed(2)}
                </label>
                <input
                  id="lr"
                  type="range"
                  min={0.01}
                  max={0.6}
                  step={0.01}
                  value={learningRate}
                  onChange={(e) => setLearningRate(Number(e.target.value))}
                  className="mt-3 w-full accent-emerald-400"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setRunning((prev) => !prev)}
                  className="rounded-full bg-gradient-to-r from-emerald-400/90 to-cyan-400/90 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20"
                >
                  {running ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={resetSimulation}
                  className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-100 backdrop-blur-md"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </FadeSection>

        <FadeSection id="problem" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
            The Problem &amp; The Challenge of Saddle Points
          </h2>
          <p className="mt-8 max-w-5xl text-lg leading-8 text-zinc-400">
            In non-convex objectives, saddle points are ubiquitous: the gradient vanishes, but the
            point is neither minimum nor maximum. Standard metrics focus on final convergence, not
            whether an optimizer can leave this region quickly.
          </p>
        </FadeSection>

        <FadeSection id="saddle-point-visual" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
            Saddle Point Visual
          </h2>
          <svg
            viewBox="0 0 1000 360"
            className="mt-10 w-full"
            role="img"
            aria-label="Curves up and curves down around a saddle point"
          >
            <defs>
              <linearGradient id="saddleUp" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
              <linearGradient id="saddleDown" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <path
              d="M120,95 Q310,185 500,185 Q690,185 880,95"
              fill="none"
              stroke="url(#saddleUp)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M430,65 Q500,125 500,185 Q500,245 430,305"
              fill="none"
              stroke="url(#saddleDown)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle cx="500" cy="185" r="7" fill="#e2e8f0" />
            <text x="196" y="122" fill="#a78bfa" fontSize="25" fontWeight="700">
              Curves up
            </text>
            <text x="562" y="192" fill="#22d3ee" fontSize="25" fontWeight="700">
              Curves down
            </text>
          </svg>
        </FadeSection>

        <FadeSection id="see-metric" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">SEE Metric</h2>
          <p className="mt-8 text-center text-3xl font-semibold text-transparent md:text-5xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-200 bg-clip-text">
            SEE = <span className="inline-block align-middle">P<sub>esc</sub></span>/
            <span className="inline-block align-middle">&tau;<sub>avg</sub></span>
          </p>
          <p className="mx-auto mt-8 max-w-5xl text-center text-zinc-400">
            SEE rewards both reliability and speed of escape from saddle regions.
          </p>
        </FadeSection>

        <FadeSection id="benchmarks-results" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
            Benchmarks &amp; Results
          </h2>
          <p className="mt-6 max-w-3xl text-zinc-400">
            SEE scores at learning rate 0.5 across canonical non-convex benchmarks.
          </p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-zinc-300">
                  <th className="px-4 py-3 font-medium">Function</th>
                  <th className="px-4 py-3 font-medium">Fixed LR</th>
                  <th className="px-4 py-3 font-medium">Adam</th>
                  <th className="px-4 py-3 font-medium">RMSProp</th>
                  <th className="px-4 py-3 font-medium">AdaGrad</th>
                </tr>
              </thead>
              <tbody className="text-zinc-400">
                {benchmarkRows.map((row) => (
                  <tr key={row.fn} className="border-b border-white/10 last:border-b-0">
                    <td className="px-4 py-3 text-zinc-200">{row.fn}</td>
                    <td className="px-4 py-3">{row.fixed}</td>
                    <td className="px-4 py-3">{row.adam}</td>
                    <td className="px-4 py-3 text-emerald-300">{row.rmsprop}</td>
                    <td className="px-4 py-3">{row.adagrad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeSection>

        <FadeSection id="findings-recommender" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
            Findings &amp; Recommender System
          </h2>
          <p className="mt-6 max-w-5xl text-zinc-400">
            RMSProp consistently produced the strongest saddle-escape profile in this study, while
            Adam underperformed on Rosenbrock and Ackley.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div>
              <label htmlFor="landscape" className="mb-2 block text-sm font-medium text-zinc-300">
                Landscape Trait
              </label>
              <select
                id="landscape"
                value={landscape}
                onChange={(e) => setLandscape(e.target.value as Landscape)}
                className="w-full rounded-xl bg-white/5 px-4 py-3 text-zinc-100 outline-none backdrop-blur-md"
              >
                <option value="narrow-valley">Narrow curved valley</option>
                <option value="multimodal">Multimodal surface</option>
                <option value="flat-saddle">Flat saddle region</option>
                <option value="mixed">Mixed/unknown geometry</option>
              </select>
            </div>
            <div>
              <label htmlFor="goal" className="mb-2 block text-sm font-medium text-zinc-300">
                Selection Goal
              </label>
              <select
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value as Goal)}
                className="w-full rounded-xl bg-white/5 px-4 py-3 text-zinc-100 outline-none backdrop-blur-md"
              >
                <option value="fast-escape">Fastest saddle escape</option>
                <option value="balanced">Balanced robustness</option>
                <option value="baseline">Simple baseline</option>
              </select>
            </div>
            <div className="border-l border-emerald-400/40 pl-4">
              <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Recommended Optimizer</p>
              <p className="mt-3 text-xl font-semibold text-emerald-300">{recommendation.optimizer}</p>
              <p className="mt-2 text-zinc-300">Learning rate: {recommendation.lr}</p>
              <p className="mt-3 text-sm text-zinc-400">{recommendation.reason}</p>
            </div>
          </div>
        </FadeSection>

        <FadeSection id="citation" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">Citation</h2>
          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-zinc-200 backdrop-blur-md"
              >
                {copyState}
              </button>
            </div>
            <pre className="overflow-auto text-sm leading-7 text-zinc-300">{bibtex}</pre>
          </div>
        </FadeSection>
      </div>
    </main>
  );
}
