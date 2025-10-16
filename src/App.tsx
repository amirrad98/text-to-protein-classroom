import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { Label } from './components/ui/label'
import { Badge } from './components/ui/badge'
import {
  Wand2,
  Filter,
  FlaskConical,
  RotateCcw,
  Box,
  Zap,
  TestTube2,
  Beaker,
  Sparkles,
  LineChart,
  ArrowUpRight,
} from 'lucide-react'

export type Row = { id: string; seq: string; fold: number; pred: number; lab?: number }

// 1) Constants and utilities
const ALPHABET = 'ACDEFGHIKLMNPQRSTVWY'.split('')
const HYDRO = new Set(['A', 'V', 'I', 'L', 'M', 'F', 'W', 'Y'])
const BASIC = new Set(['K', 'R', 'H'])
const ACID = new Set(['D', 'E'])

const DEFAULT_ICON_SIZE = 16
export function safeSize(v?: number | string, fallback = DEFAULT_ICON_SIZE) {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n as number) && (n as number) > 0 ? (n as number) : fallback
}

// 2) RNG and core functions
export function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashPrompt(prompt: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

export function genSeq(len: number, rng: () => number) {
  let s = ''
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(rng() * ALPHABET.length)
    s += ALPHABET[idx]
  }
  return s
}

export function comp(seq: string) {
  let h = 0,
    b = 0,
    a = 0,
    o = 0
  for (const c of seq) {
    if (HYDRO.has(c)) h++
    else if (BASIC.has(c)) b++
    else if (ACID.has(c)) a++
    else o++
  }
  const n = Math.max(1, seq.length)
  return { h, b, a, o, hf: h / n, bf: b / n, af: a / n }
}

export function toyFoldScore(seq: string) {
  const c = comp(seq)
  // target hydrophobic fraction near 0.45
  const hydScore = 100 - Math.min(100, Math.abs(c.hf - 0.45) * 400)
  // charge balance near 0
  const charge = c.b - c.a
  const chargeScore = 100 - Math.min(100, Math.abs(charge) * 10)
  const s = Math.max(0, Math.min(100, 0.6 * hydScore + 0.4 * chargeScore))
  return s
}

export function toyActivity(seq: string, prompt: string) {
  const fold = toyFoldScore(seq)
  // deterministic boost from prompt
  const ph = hashPrompt(prompt)
  // motif boosts
  let motif = 0
  const motifs = ['GL', 'GP', 'KR', 'HG', 'FY']
  for (const m of motifs) {
    if (seq.includes(m)) motif += 5
  }
  const base = 0.7 * fold + 20 * ph + motif
  return base
}

export function simulateLab(x: number, rng: () => number) {
  // add bounded noise, clamp to 0..160
  const noise = (rng() - 0.5) * 20 // +-10 range
  let v = x + noise
  if (Number.isNaN(v) || !Number.isFinite(v)) v = 0
  v = Math.max(0, Math.min(160, v))
  return v
}

// 3) 3D backbone builder
export type P3 = [number, number, number]
export function buildBackbone(seq: string, seed: number): P3[] {
  if (!seq) return []
  const rng = mulberry32(seed >>> 0)
  const points: P3[] = []
  const turns = 1.8 // helix pitch
  const step = 0.7 // spacing along axis
  for (let i = 0; i < seq.length; i++) {
    const t = i * turns
    const r = 2.0 + rng() * 0.2
    const x = Math.cos(t) * r + (rng() - 0.5) * 0.15
    const y = Math.sin(t) * r + (rng() - 0.5) * 0.15
    const z = i * step + (rng() - 0.5) * 0.1
    points.push([x, y, z])
  }
  return points
}

// 4) React app
function MiniBar({ value, max = 160 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="relative h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function residueColor(c: string) {
  if (HYDRO.has(c)) return new THREE.Color('black')
  if (BASIC.has(c)) return new THREE.Color('blue')
  if (ACID.has(c)) return new THREE.Color('red')
  return new THREE.Color('green')
}

function Viewer({ seq, seed }: { seq: string; seed: number }) {
  const pts = useMemo(() => buildBackbone(seq, seed), [seq, seed])
  const linePts = useMemo(() => pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), [pts])
  return (
    <Canvas camera={{ position: [6, 6, 10], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <Line points={linePts} lineWidth={2} color="gray" />
      {pts.map((p, i) => {
        const col = residueColor(seq[i])
        return (
          <mesh key={i} position={p as any}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial color={col} />
          </mesh>
        )
      })}
      <OrbitControls enablePan enableRotate enableZoom />
    </Canvas>
  )
}

function TestsPanel() {
  const [lines, setLines] = useState<string[]>([])
  function run() {
    const out: string[] = []
    function ok(name: string, pass: boolean) {
      out.push(`${pass ? 'PASS' : 'FAIL'} - ${name}`)
    }

    try {
      // genSeq length
      const r1 = mulberry32(1)
      ok('genSeq returns requested length for 10', genSeq(10, r1).length === 10)

      // toyFoldScore range
      const fold = toyFoldScore('ACDEFGHIKLMNPQRSTVWY')
      ok('toyFoldScore between 0 and 100 for the full alphabet string', fold >= 0 && fold <= 100)

      // toyActivity finite
      const act = toyActivity('ACDEFGHIK', 'hello protein')
      ok('toyActivity returns finite number for a sample sequence and prompt', Number.isFinite(act))

      // simulateLab clamps to 160
      const r2 = mulberry32(2)
      ok('simulateLab clamps to 160 max when passed 1000', simulateLab(1000, r2) === 160)

      // buildBackbone length equals sequence length for a 9-mer
      const bb = buildBackbone('ACDEFGHIK', 7)
      ok('buildBackbone length equals sequence length for a 9-mer', bb.length === 9)

      // mulberry32 deterministic first draw matches when re-seeded
      const a1 = mulberry32(123)()
      const a2 = mulberry32(123)()
      ok('mulberry32 deterministic first draw matches when re-seeded', a1 === a2)

      // safeSize cases
      const sizes = [undefined, 0, -5, '20', 'bad'].map((v) => safeSize(v as any))
      const expect = [16, 16, 16, 20, 16]
      ok('safeSize returns sane widths for [undefined, 0, -5, "20", "bad"]', sizes.every((v, i) => v === expect[i]))

      // buildBackbone empty sequence yields no points
      ok('buildBackbone empty sequence yields no points', buildBackbone('', 1).length === 0)

      // toyActivity deterministic for same inputs
      const t1 = toyActivity('ACACACAC', 'x')
      const t2 = toyActivity('ACACACAC', 'x')
      ok('toyActivity is deterministic for same inputs', t1 === t2)

      setLines(out)
    } catch (e: unknown) {
      setLines([`FAIL - exception: ${e instanceof Error ? e.message : String(e)}`])
    }
  }

  const allPass = lines.length > 0 && lines.every((l) => l.startsWith('PASS'))

  return (
    <Card className="border-dashed border-primary/30 bg-card/70 shadow-none backdrop-blur">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TestTube2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Instructional Tests</CardTitle>
              <CardDescription>
                Validate deterministic helpers live in your classroom session.
              </CardDescription>
            </div>
          </div>
          {lines.length > 0 && (
            <Badge
              variant={allPass ? 'success' : 'outline'}
              className={allPass ? '' : 'border-destructive/40 text-destructive'}
            >
              {allPass ? 'Passing' : 'Attention'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} size="sm" className="gap-2">
            <Zap className="h-3.5 w-3.5" />
            Run suite
          </Button>
          <p className="text-xs text-muted-foreground">
            Every check is deterministic—perfect for live demos.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-muted-foreground">
              Suite idle. Trigger the run to see results.
            </div>
          ) : (
            lines.map((l, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  l.startsWith('PASS')
                    ? 'border-primary/20 bg-primary/5 text-primary'
                    : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                <span>{l}</span>
                <ArrowUpRight className="h-3 w-3 opacity-50" />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const [prompt, setPrompt] = useState('short antimicrobial helix')
  const [count, setCount] = useState(8)
  const [lengthAA, setLengthAA] = useState(20)
  const [seed, setSeed] = useState(42)
  const [rows, setRows] = useState<Row[]>([])
  const [sel, setSel] = useState<Row | null>(null)

  function generate() {
    const rng = mulberry32(seed >>> 0)
    const out: Row[] = []
    for (let i = 0; i < count; i++) {
      const id = `${seed}-${i}-${lengthAA}`
      const seq = genSeq(lengthAA, rng)
      out.push({ id, seq, fold: 0, pred: 0 })
    }
    setRows(out)
    setSel(null)
  }

  function screen() {
    const scored = rows
      .map((r) => {
        const fold = toyFoldScore(r.seq)
        const pred = toyActivity(r.seq, prompt)
        return { ...r, fold, pred }
      })
      .sort((a, b) => b.pred - a.pred)
    setRows(scored)
  }

  function lab() {
    const rng = mulberry32((seed + 999) >>> 0)
    const tested = rows.map((r) => ({ ...r, lab: simulateLab(r.pred, rng) }))
    setRows(tested)
  }

  function reset() {
    setRows([])
    setSel(null)
  }

  const derived = useMemo(() => {
    const generated = rows.length
    let screened = 0
    let labReady = 0
    let high = 0
    for (const r of rows) {
      if (r.fold > 0 || r.pred > 0) screened++
      if (typeof r.lab === 'number') labReady++
      if ((r.lab ?? r.pred) > 120) high++
    }
    const topPred = rows.length ? rows[0].pred : null
    return { generated, screened, lab: labReady, high, topPred }
  }, [rows])

  const hasRows = rows.length > 0

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center">
          <div className="h-[480px] w-[480px] rounded-full bg-primary/20 blur-3xl" />
        </div>
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <header className="mb-12 rounded-[2.5rem] border border-border/60 bg-card/80 px-10 py-12 shadow-xl shadow-primary/5 backdrop-blur">
            <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="space-y-7">
                <div className="flex items-center gap-2">
                  <Badge variant="muted" className="flex items-center gap-1.5 bg-primary/10 text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Classroom edition
                  </Badge>
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Turn natural language into teachable protein design experiments
                  </h1>
                  <p className="max-w-xl text-base text-muted-foreground">
                    Guide your students through the discovery pipeline—generate protein candidates, apply toy folding
                    scores, simulate wet lab assays, and visualise structures without leaving the browser.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={generate} className="gap-2">
                    <Wand2 className="h-4 w-4" />
                    Generate cohort
                  </Button>
                  <Button onClick={screen} variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Screen candidates
                  </Button>
                  <Button onClick={lab} variant="ghost" className="gap-2 text-primary hover:bg-primary/10">
                    <FlaskConical className="h-4 w-4" />
                    Simulate lab run
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-primary/20 bg-primary/10 p-5 shadow-sm">
                  <p className="text-xs uppercase text-primary/80">Generated</p>
                  <p className="mt-2 text-3xl font-semibold text-primary">
                    {derived.generated.toString().padStart(2, '0')}
                  </p>
                  <p className="mt-1 text-xs text-primary/80">candidates ready for screening</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-5 shadow-sm">
                  <p className="text-xs uppercase text-muted-foreground">Screened</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {derived.screened.toString().padStart(2, '0')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">with folding and activity scores</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-500/5 p-5 shadow-sm sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase text-emerald-600">High activity</p>
                    {derived.topPred !== null && (
                      <Badge variant="success" className="gap-1">
                        <LineChart className="h-3 w-3" />
                        {derived.topPred.toFixed(1)}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-3xl font-semibold text-emerald-600">
                    {derived.high.toString().padStart(2, '0')}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700/90">sequences scoring above 120 units</p>
                </div>
              </div>
            </div>
          </header>

          <section className="space-y-10">
            <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
              <Card className="shadow-lg shadow-primary/5">
                <CardHeader className="space-y-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <Wand2 className="h-5 w-5" />
                    <CardTitle>Design Controls</CardTitle>
                  </div>
                  <CardDescription>
                    Tune the prompt and sampling parameters before generating the next cohort.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="prompt" className="text-sm font-medium text-foreground">
                      Plain-language brief
                    </Label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={3}
                      placeholder="Describe the protein you want to generate..."
                      className="resize-none"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="count">Candidates</Label>
                      <Input
                        id="count"
                        type="number"
                        value={count}
                        min={1}
                        max={64}
                        onChange={(e) => setCount(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="length">Length (AA)</Label>
                      <Input
                        id="length"
                        type="number"
                        value={lengthAA}
                        min={5}
                        max={200}
                        onChange={(e) => setLengthAA(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="seed">Seed</Label>
                      <Input
                        id="seed"
                        type="number"
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={generate} className="gap-2">
                      <Wand2 className="h-4 w-4" />
                      Generate
                    </Button>
                    <Button onClick={screen} variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Screen
                    </Button>
                    <Button onClick={lab} variant="outline" className="gap-2">
                      <FlaskConical className="h-4 w-4" />
                      Lab Test
                    </Button>
                    <Button
                      onClick={reset}
                      variant="ghost"
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-8">
                <Card>
                  <CardHeader className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Beaker className="h-5 w-5 text-primary" />
                      <CardTitle>Classroom Runbook</CardTitle>
                    </div>
                    <CardDescription>Spin up the exercise locally in a few commands.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                      <li>npm create vite@latest text-to-protein -- --template react-ts</li>
                      <li>cd text-to-protein</li>
                      <li>npm i @react-three/fiber @react-three/drei three</li>
                      <li>mkdir -p src/components/ui</li>
                      <li>Paste in the shadcn UI shims and this App.tsx</li>
                      <li>npm run dev and open http://localhost:5173</li>
                    </ol>
                  </CardContent>
                </Card>

                <Card className="border-dashed border-primary/30 bg-primary/5 shadow-none">
                  <CardHeader className="space-y-1.5">
                    <div className="flex items-center gap-2 text-primary">
                      <LineChart className="h-5 w-5" />
                      <CardTitle>Progress Pulse</CardTitle>
                    </div>
                    <CardDescription>Snapshot of the cohort as you move through the workflow.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Lab ready</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {derived.lab.toString().padStart(2, '0')}
                      </p>
                      <p className="text-xs text-muted-foreground">sequences with synthetic lab results</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Prompt focus</p>
                      <p className="mt-1 text-2xl font-semibold">{lengthAA}</p>
                      <p className="text-xs text-muted-foreground">target amino acids per candidate</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="shadow-lg shadow-primary/5">
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Box className="h-5 w-5 text-primary" />
                    <CardTitle>Results Overview</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {hasRows ? `${rows.length} candidates` : 'Awaiting run'}
                  </Badge>
                </div>
                <CardDescription>
                  Compare sequences, screen scores, and simulated assays side by side.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!hasRows ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 py-14 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border">
                      <Box className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium text-foreground">No sequences yet</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      Start by generating a cohort, then run screen and lab simulation to populate the table.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/70 text-muted-foreground">
                          <th className="py-3 text-left font-medium">#</th>
                          <th className="py-3 text-left font-medium">Sequence</th>
                          <th className="py-3 text-left font-medium">Fold Score</th>
                          <th className="py-3 text-left font-medium">Predicted Activity</th>
                          <th className="py-3 text-left font-medium">Lab Result</th>
                          <th className="py-3 text-left font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr
                            key={r.id}
                            className="border-b border-border/60 transition-colors duration-150 hover:bg-muted/50"
                          >
                            <td className="py-3 pr-2 text-left font-medium text-muted-foreground">
                              {(idx + 1).toString().padStart(2, '0')}
                            </td>
                            <td className="py-3 pr-4">
                              <button
                                title="Click to show 3D structure"
                                className="rounded-md border border-transparent bg-muted px-2 py-1 font-mono text-xs transition-colors hover:border-primary/40 hover:bg-accent"
                                onClick={() => setSel(r)}
                              >
                                {r.seq}
                              </button>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="w-12 text-right font-medium text-foreground">
                                  {r.fold.toFixed(1)}
                                </span>
                                <MiniBar value={r.fold} max={100} />
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="w-12 text-right font-medium text-foreground">
                                  {r.pred.toFixed(1)}
                                </span>
                                <MiniBar value={r.pred} max={160} />
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              {typeof r.lab === 'number' ? (
                                <div className="flex items-center gap-2">
                                  <span className="w-12 text-right font-medium text-foreground">
                                    {r.lab.toFixed(1)}
                                  </span>
                                  <MiniBar value={r.lab} max={160} />
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pending</span>
                              )}
                            </td>
                            <td className="py-3">
                              <Button size="sm" variant="outline" onClick={() => setSel(r)}>
                                View 3D
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-8 lg:grid-cols-2">
              <Card className="shadow-lg shadow-primary/5">
                <CardHeader className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Box className="h-5 w-5 text-primary" />
                      <CardTitle>Structure Viewer</CardTitle>
                    </div>
                    <Badge variant="outline">{sel ? sel.seq.length : lengthAA} AA</Badge>
                  </div>
                  <CardDescription>
                    Explore the toy helix backbone rendered with three.js. Colours map to residue chemistry.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!sel ? (
                    <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 text-center text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">No sequence selected</p>
                      <p className="mt-2 max-w-xs">
                        Pick a sequence from the results table to visualise its 3D backbone.
                      </p>
                      <p className="mt-4 text-xs text-muted-foreground/70">
                        Colour legend: hydrophobic (black), basic (blue), acidic (red), neutral (green)
                      </p>
                    </div>
                  ) : (
                    <div className="h-80 overflow-hidden rounded-2xl border border-border/60 bg-black/5">
                      <Viewer seq={sel.seq} seed={seed} />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg shadow-primary/5">
                <CardHeader className="space-y-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <LineChart className="h-5 w-5" />
                    <CardTitle>Analysis Highlights</CardTitle>
                  </div>
                  <CardDescription>Quick insights from the current cohort.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!hasRows ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                      Generate and score sequences to populate cohort insights.
                    </div>
                  ) : (
                    <>
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-muted-foreground">Top candidates</h4>
                        <ol className="space-y-1 rounded-2xl border border-border/70 bg-muted/30 p-4 text-xs">
                          {rows.slice(0, 5).map((r) => (
                            <li key={r.id} className="flex items-center justify-between font-mono">
                              <span>{r.seq}</span>
                              <Badge variant="muted" className="font-sans">
                                {r.pred.toFixed(1)}
                              </Badge>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <FlaskConical className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {derived.high} sequences above 120 activity
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Perfect checkpoint for discussing hit selection strategy.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <TestsPanel />
          </section>
        </div>
      </div>
    </div>
  )
}
