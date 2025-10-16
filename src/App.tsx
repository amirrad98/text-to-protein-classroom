import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { Label } from './components/ui/label'
import { 
  Wand2, 
  Filter, 
  FlaskConical, 
  RotateCcw, 
  Box,
  Zap,
  TestTube2,
  Beaker
} from 'lucide-react'

export type Row = { id: string; seq: string; fold: number; pred: number; lab?: number }

// 1) Constants and utilities
const ALPHABET = 'ACDEFGHIKLMNPQRSTVWY'.split('')
const HYDRO = new Set(['A','V','I','L','M','F','W','Y'])
const BASIC = new Set(['K','R','H'])
const ACID = new Set(['D','E'])

const DEFAULT_ICON_SIZE = 16
function safeSize(v?: number | string, fallback = DEFAULT_ICON_SIZE){
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n as number) && (n as number) > 0 ? (n as number) : fallback
}

// 2) RNG and core functions
export function mulberry32(a: number){
  return function(){
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashPrompt(prompt: string){
  let h = 2166136261 >>> 0
  for (let i=0;i<prompt.length;i++){
    h ^= prompt.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xFFFFFFFF
}

export function genSeq(len: number, rng: ()=>number){
  let s = ''
  for (let i=0;i<len;i++){
    const idx = Math.floor(rng() * ALPHABET.length)
    s += ALPHABET[idx]
  }
  return s
}

export function comp(seq: string){
  let h=0,b=0,a=0,o=0
  for(const c of seq){
    if (HYDRO.has(c)) h++
    else if (BASIC.has(c)) b++
    else if (ACID.has(c)) a++
    else o++
  }
  const n = Math.max(1, seq.length)
  return { h, b, a, o, hf: h/n, bf: b/n, af: a/n }
}

export function toyFoldScore(seq: string){
  const c = comp(seq)
  // target hydrophobic fraction near 0.45
  const hydScore = 100 - Math.min(100, Math.abs(c.hf - 0.45) * 400)
  // charge balance near 0
  const charge = c.b - c.a
  const chargeScore = 100 - Math.min(100, Math.abs(charge) * 10)
  const s = Math.max(0, Math.min(100, 0.6*hydScore + 0.4*chargeScore))
  return s
}

export function toyActivity(seq: string, prompt: string){
  const fold = toyFoldScore(seq)
  // deterministic boost from prompt
  const ph = hashPrompt(prompt)
  // motif boosts
  let motif = 0
  const motifs = ['GL','GP','KR','HG','FY']
  for(const m of motifs){ if (seq.includes(m)) motif += 5 }
  const base = 0.7*fold + 20*ph + motif
  return base
}

export function simulateLab(x: number, rng: ()=>number){
  // add bounded noise, clamp to 0..160
  const noise = (rng()-0.5)*20 // +-10 range
  let v = x + noise
  if (Number.isNaN(v) || !Number.isFinite(v)) v = 0
  v = Math.max(0, Math.min(160, v))
  return v
}

// 3) 3D backbone builder
export type P3 = [number, number, number]
export function buildBackbone(seq: string, seed: number): P3[]{
  if (!seq) return []
  const rng = mulberry32(seed >>> 0)
  const points: P3[] = []
  const turns = 1.8 // helix pitch
  const step = 0.7 // spacing along axis
  for(let i=0;i<seq.length;i++){
    const t = i * turns
    const r = 2.0 + (rng()*0.2)
    const x = Math.cos(t) * r + (rng()-0.5)*0.15
    const y = Math.sin(t) * r + (rng()-0.5)*0.15
    const z = i*step + (rng()-0.5)*0.1
    points.push([x,y,z])
  }
  return points
}

// 4) React app
function MiniBar({ value, max=160 }:{value:number; max?:number}){
  const pct = Math.max(0, Math.min(100, (value/max)*100))
  return (
    <div className="w-full h-2 bg-muted rounded">
      <div className="h-2 rounded bg-primary" style={{ width: pct+'%' }} />
    </div>
  )
}

function residueColor(c: string){
  if (HYDRO.has(c)) return new THREE.Color('black')
  if (BASIC.has(c)) return new THREE.Color('blue')
  if (ACID.has(c)) return new THREE.Color('red')
  return new THREE.Color('green')
}

function Viewer({ seq, seed }:{seq:string; seed:number}){
  const pts = useMemo(()=>buildBackbone(seq, seed), [seq, seed])
  const linePts = useMemo(()=>pts.map(p=>new THREE.Vector3(p[0],p[1],p[2])), [pts])
  return (
    <Canvas camera={{ position: [6,6,10], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5,5,5]} intensity={0.8} />
      <Line points={linePts} lineWidth={2} color="gray" />
      {pts.map((p,i)=>{
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

function TestsPanel(){
  const [lines, setLines] = useState<string[]>([])
  function run(){
    const out: string[] = []
    function ok(name: string, pass: boolean){ out.push(`${pass ? 'PASS' : 'FAIL'} - ${name}`) }

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
      const sizes = [undefined, 0, -5, '20', 'bad'].map(v=>safeSize(v as any))
      const expect = [16,16,16,20,16]
      ok('safeSize returns sane widths for [undefined, 0, -5, "20", "bad"]', sizes.every((v,i)=>v===expect[i]))

      // buildBackbone empty sequence yields no points
      ok('buildBackbone empty sequence yields no points', buildBackbone('', 1).length === 0)

      // toyActivity deterministic for same inputs
      const t1 = toyActivity('ACACACAC', 'x')
      const t2 = toyActivity('ACACACAC', 'x')
      ok('toyActivity is deterministic for same inputs', t1 === t2)

      setLines(out)
    } catch(e: unknown){
      setLines([`FAIL - exception: ${e instanceof Error ? e.message : String(e)}`])
    }
  }

  const allPass = lines.length>0 && lines.every(l=>l.startsWith('PASS'))

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube2 className="h-5 w-5" />
          Tests Panel
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={run} variant="outline">
            <Zap className="h-4 w-4" />
            Run Tests
          </Button>
          {lines.length>0 && (
            <span className={`text-sm font-medium ${allPass ? 'text-primary' : 'text-destructive'}`}>
              {allPass ? 'All tests passed' : 'Some tests failed'}
            </span>
          )}
        </div>
        <div className="space-y-1 text-sm">
          {lines.map((l,i)=>(
            <div 
              key={i} 
              className={`p-2 rounded-md ${l.startsWith('PASS') ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}
            >
              {l}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function App(){
  const [prompt, setPrompt] = useState('short antimicrobial helix')
  const [count, setCount] = useState(8)
  const [lengthAA, setLengthAA] = useState(20)
  const [seed, setSeed] = useState(42)
  const [rows, setRows] = useState<Row[]>([])
  const [sel, setSel] = useState<Row | null>(null)

  function generate(){
    const rng = mulberry32(seed >>> 0)
    const out: Row[] = []
    for (let i=0;i<count;i++){
      const id = `${seed}-${i}-${lengthAA}`
      const seq = genSeq(lengthAA, rng)
      out.push({ id, seq, fold: 0, pred: 0 })
    }
    setRows(out)
    setSel(null)
  }

  function screen(){
    const scored = rows.map(r=>{
      const fold = toyFoldScore(r.seq)
      const pred = toyActivity(r.seq, prompt)
      return { ...r, fold, pred }
    }).sort((a,b)=> b.pred - a.pred)
    setRows(scored)
  }

  function lab(){
    const rng = mulberry32((seed+999) >>> 0)
    const tested = rows.map(r=> ({ ...r, lab: simulateLab(r.pred, rng) }))
    setRows(tested)
  }

  function reset(){ setRows([]); setSel(null) }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Box className="h-8 w-8 text-primary" />
            Text to Protein
            <span className="text-lg font-normal text-muted-foreground">- Classroom Demo</span>
          </h1>
        </header>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="prompt">Plain English Prompt</Label>
                <Textarea 
                  id="prompt"
                  value={prompt} 
                  onChange={(e)=>setPrompt(e.target.value)} 
                  rows={3}
                  placeholder="Describe the protein you want to generate..."
                  className="resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="count">Candidates</Label>
                  <Input 
                    id="count"
                    type="number" 
                    value={count} 
                    min={1} 
                    max={64} 
                    onChange={(e)=>setCount(Number(e.target.value)||0)} 
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
                    onChange={(e)=>setLengthAA(Number(e.target.value)||0)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seed">Seed</Label>
                  <Input 
                    id="seed"
                    type="number" 
                    value={seed} 
                    onChange={(e)=>setSeed(Number(e.target.value)||0)} 
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
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
                <Button onClick={reset} variant="outline" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Beaker className="h-5 w-5" />
                Quick Setup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal pl-5 text-sm space-y-2 text-muted-foreground">
                <li>npm create vite@latest text-to-protein -- --template react-ts</li>
                <li>cd text-to-protein</li>
                <li>npm i @react-three/fiber @react-three/drei three</li>
                <li>mkdir -p src/components/ui</li>
                <li>Paste UI shims and this App.tsx</li>
                <li>npm run dev and open http://localhost:5173</li>
              </ol>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="mb-4">
                    <Box className="h-12 w-12 mx-auto text-muted" />
                  </div>
                  <p className="text-lg font-medium mb-2">No sequences generated yet</p>
                  <p className="text-sm">Click Generate to create candidates, then use Screen to score and sort them.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 font-medium text-foreground">#</th>
                        <th className="text-left py-3 px-2 font-medium text-foreground">Sequence</th>
                        <th className="text-left py-3 px-2 font-medium text-foreground">Fold Score</th>
                        <th className="text-left py-3 px-2 font-medium text-foreground">Predicted Activity</th>
                        <th className="text-left py-3 px-2 font-medium text-foreground">Lab Result</th>
                        <th className="text-left py-3 px-2 font-medium text-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r,idx)=> (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                          <td className="py-3 px-2 text-sm font-medium text-foreground">{idx+1}</td>
                          <td className="py-3 px-2">
                            <button 
                              title="Click to show 3D structure" 
                              className="font-mono text-sm bg-muted hover:bg-accent px-2 py-1 rounded transition-colors" 
                              onClick={()=>setSel(r)}
                            >
                              {r.seq}
                            </button>
                          </td>
                          <td className="py-3 px-2 w-40">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium w-12 text-right">{r.fold.toFixed(1)}</span>
                              <div className="flex-1"><MiniBar value={r.fold} max={100} /></div>
                            </div>
                          </td>
                          <td className="py-3 px-2 w-44">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium w-12 text-right">{r.pred.toFixed(1)}</span>
                              <div className="flex-1"><MiniBar value={r.pred} max={160} /></div>
                            </div>
                          </td>
                          <td className="py-3 px-2 w-44">
                            {typeof r.lab === 'number' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium w-12 text-right">{r.lab.toFixed(1)}</span>
                                <div className="flex-1"><MiniBar value={r.lab} max={160} /></div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <Button size="sm" variant="outline" onClick={()=>setSel(r)}>
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

          <Card>
            <CardHeader>
              <CardTitle>3D Viewer</CardTitle>
            </CardHeader>
            <CardContent>
              {!sel ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="mb-4">
                    <Box className="h-12 w-12 mx-auto text-muted" />
                  </div>
                  <p className="font-medium mb-2">No sequence selected</p>
                  <p className="text-sm">Click on a sequence to view its 3D structure.</p>
                  <p className="text-xs mt-2 text-muted-foreground/70">
                    Colors: hydrophobic (black), basic (blue), acidic (red), other (green)
                  </p>
                </div>
              ) : (
                <div className="h-80 rounded-lg overflow-hidden border border-border">
                  <Viewer seq={sel.seq} seed={seed} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Run Screen to get rankings and explore hits.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Top 5 Candidates</h4>
                    <ol className="list-decimal pl-5 space-y-1 text-sm">
                      {rows.slice(0,5).map((r)=>(
                        <li key={r.id} className="font-mono text-xs bg-muted p-2 rounded">
                          {r.seq} - <span className="font-medium">{r.pred.toFixed(1)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {rows.filter(r=> (r.lab ?? 0) > 120).length}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        sequences with lab activity above 120
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <TestsPanel />
        </div>
      </div>
    </div>
  )
}
