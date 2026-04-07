"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type Optimizer = "fixed" | "adam" | "rmsprop" | "adagrad";
type Landscape = "narrow-valley" | "multimodal" | "flat-saddle" | "mixed";
type Goal = "fast-escape" | "balanced" | "baseline";

const initialTrajectory = { x: 0.12, y: 0.08 };
const resetRange = {
  xMin: 0.07,
  xSpan: 0.08,
  yMin: 0.04,
  ySpan: 0.08,
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
  const [optimizer, setOptimizer] = useState<Optimizer>("rmsprop");
  const [learningRate, setLearningRate] = useState(0.2);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("Near saddle");
  const [path, setPath] = useState<Array<{ x: number; y: number }>>([initialTrajectory]);
  const [landscape, setLandscape] = useState<Landscape>("narrow-valley");
  const [goal, setGoal] = useState<Goal>("fast-escape");
  const [copyState, setCopyState] = useState("Copy");
  const sim = useRef({
    x: initialTrajectory.x,
    y: initialTrajectory.y,
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

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const state = sim.current;
      const beta1 = 0.9;
      const beta2 = 0.99;
      const rho = 0.92;
      const eps = 1e-7;
      const gx = 2 * state.x;
      const gy = -0.12 * state.y;

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
        const dampingFactor = Math.hypot(state.x, state.y) < 0.4 ? 0.3 : 1;
        state.x -= (learningRate / (Math.sqrt(vHatX) + eps)) * mHatX * dampingFactor;
        state.y -= (learningRate / (Math.sqrt(vHatY) + eps)) * mHatY * dampingFactor;
      }

      state.frame += 1;
      setStep(state.frame);
      setPath((prev) => [...prev.slice(-159), { x: state.x, y: state.y }]);
      const radius = Math.hypot(state.x, state.y);

      if (radius >= 1.6) {
        setStatus(`Escaped in ${state.frame} steps`);
        setRunning(false);
        return;
      }
      if (state.frame >= 260) {
        setStatus("Stalled near saddle");
        setRunning(false);
        return;
      }
      setStatus("Near saddle");
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [learningRate, optimizer, running]);

  useEffect(() => {
    if (!running && frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, [running]);

  const resetSimulation = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setRunning(false);
    sim.current = {
      x: resetRange.xMin + Math.random() * resetRange.xSpan,
      y: resetRange.yMin + Math.random() * resetRange.ySpan,
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
    setPath([{ x: sim.current.x, y: sim.current.y }]);
  };

  const pathPoints = path
    .map(({ x, y }) => `${380 + x * 130},${180 - y * 84}`)
    .join(" ");

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
              className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-zinc-100 ring-1 ring-white/15 transition hover:bg-zinc-800"
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
            Tune the optimizer and learning rate to see escape behavior in a saddle landscape with
            weak curvature along one axis.
          </p>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1.45fr_1fr]">
            <div className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10">
              <svg
                viewBox="0 0 760 360"
                className="h-auto w-full rounded-2xl bg-gradient-to-br from-violet-500/10 via-zinc-950 to-emerald-500/10"
                role="img"
                aria-label="Saddle trajectory visualization"
              >
                <defs>
                  <linearGradient id="escapeStroke" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <path d="M90,90 Q235,180 380,180 Q525,180 670,90" fill="none" stroke="#8b5cf6" strokeWidth="4" />
                <path d="M300,70 Q380,125 380,180 Q380,235 300,290" fill="none" stroke="#10b981" strokeWidth="4" />
                <polyline points={pathPoints} fill="none" stroke="url(#escapeStroke)" strokeWidth="3.2" />
                <circle cx={380 + sim.current.x * 130} cy={180 - sim.current.y * 84} r="6.5" fill="#a78bfa" />
                <circle cx={380} cy={180} r="5.5" fill="#fff" />
              </svg>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200 ring-1 ring-emerald-400/25">
                  Status: {status}
                </span>
                <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-200 ring-1 ring-cyan-400/25">
                  Step: {step}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="optimizer" className="mb-2 block text-sm font-medium text-zinc-300">
                  Optimizer
                </label>
                <select
                  id="optimizer"
                  value={optimizer}
                  onChange={(e) => {
                    setOptimizer(e.target.value as Optimizer);
                    resetSimulation();
                  }}
                  className="w-full rounded-xl bg-white/[0.04] px-4 py-3 text-zinc-100 ring-1 ring-white/10 outline-none transition focus:ring-emerald-400/50"
                >
                  <option value="fixed">Fixed</option>
                  <option value="adam">Adam</option>
                  <option value="rmsprop">RMSProp</option>
                  <option value="adagrad">AdaGrad</option>
                </select>
              </div>
              <div>
                <label htmlFor="lr" className="mb-2 block text-sm font-medium text-zinc-300">
                  Learning Rate: {learningRate.toFixed(2)}
                </label>
                <input
                  id="lr"
                  type="range"
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  value={learningRate}
                  onChange={(e) => setLearningRate(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setRunning((prev) => !prev)}
                  className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-zinc-950"
                >
                  {running ? "Pause" : "Start"}
                </button>
                <button
                  type="button"
                  onClick={resetSimulation}
                  className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-100 ring-1 ring-white/15"
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
            <path d="M120,95 Q310,185 500,185 Q690,185 880,95" fill="none" stroke="#8b5cf6" strokeWidth="6" />
            <path d="M430,65 Q500,125 500,185 Q500,245 430,305" fill="none" stroke="#34d399" strokeWidth="6" />
            <circle cx="500" cy="185" r="7" fill="#f4f4f5" />
            <text x="196" y="122" fill="#a78bfa" fontSize="25" fontWeight="700">
              Curves up
            </text>
            <text x="562" y="192" fill="#34d399" fontSize="25" fontWeight="700">
              Curves down
            </text>
          </svg>
        </FadeSection>

        <FadeSection id="see-metric" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">SEE Metric</h2>
          <p className="mt-8 text-center text-3xl text-emerald-300 md:text-5xl">
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
          <div className="mt-8 overflow-x-auto rounded-2xl bg-white/[0.02] p-2 ring-1 ring-white/10">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="text-zinc-300">
                  <th className="px-4 py-3 font-medium">Function</th>
                  <th className="px-4 py-3 font-medium">Fixed LR</th>
                  <th className="px-4 py-3 font-medium">Adam</th>
                  <th className="px-4 py-3 font-medium">RMSProp</th>
                  <th className="px-4 py-3 font-medium">AdaGrad</th>
                </tr>
              </thead>
              <tbody className="text-zinc-400">
                {benchmarkRows.map((row) => (
                  <tr key={row.fn} className="border-t border-white/10">
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
                className="w-full rounded-xl bg-white/[0.04] px-4 py-3 text-zinc-100 ring-1 ring-white/10 outline-none"
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
                className="w-full rounded-xl bg-white/[0.04] px-4 py-3 text-zinc-100 ring-1 ring-white/10 outline-none"
              >
                <option value="fast-escape">Fastest saddle escape</option>
                <option value="balanced">Balanced robustness</option>
                <option value="baseline">Simple baseline</option>
              </select>
            </div>
            <div className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
              <p className="text-sm text-zinc-400">Recommended Optimizer</p>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{recommendation.optimizer}</p>
              <p className="mt-2 text-zinc-300">Learning rate: {recommendation.lr}</p>
              <p className="mt-3 text-sm text-zinc-400">{recommendation.reason}</p>
            </div>
          </div>
        </FadeSection>

        <FadeSection id="citation" className="py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-5xl">Citation</h2>
          <div className="mt-8 rounded-2xl bg-zinc-900/90 p-6 ring-1 ring-white/10">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10"
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
