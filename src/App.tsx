import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import { Card, CardContent, CardHeader } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { Label } from './components/ui/label'

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

function IconWand({ size = DEFAULT_ICON_SIZE }:{size?:number|string}){
  const s = safeSize(size)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 22 L10 14" />
      <path d="M15 4 L12 7" />
      <path d="M14 7 L17 10" />
      <path d="M5 19 L8 22" />
    </svg>
  )
}
function IconFilter({ size = DEFAULT_ICON_SIZE }:{size?:number|string}){
  const s = safeSize(size)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4 L21 4" />
      <path d="M7 10 L17 10" />
      <path d="M10 16 L14 16" />
    </svg>
  )
}
function IconFlask({ size = DEFAULT_ICON_SIZE }:{size?:number|string}){
  const s = safeSize(size)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 2 L9 7 L5 13 A6 6 0 0 0 19 13 L15 7 L15 2" />
      <path d="M6 13 L18 13" />
    </svg>
  )
}
function IconRotate({ size = DEFAULT_ICON_SIZE }:{size?:number|string}){
  const s = safeSize(size)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12 A9 9 0 0 1 21 12" />
      <path d="M21 12 L18 9" />
      <path d="M21 12 L18 15" />
    </svg>
  )
}
function IconCube({ size = 14 }:{size?:number|string}){
  const s = safeSize(size)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 L20 7 L12 12 L4 7 Z" />
      <path d="M4 7 L4 17 L12 22 L12 12" />
      <path d="M20 7 L20 17 L12 22" />
    </svg>
  )
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
    <div className="w-full h-2 bg-gray-100 rounded">
      <div className="h-2 rounded" style={{ width: pct+'%', background: '#4ade80' }} />
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
      const sizes = [undefined as any, 0 as any, -5 as any, '20' as any, 'bad' as any].map(v=>safeSize(v))
      const expect = [16,16,16,20,16]
      ok('safeSize returns sane widths for [undefined, 0, -5, "20", "bad"]', sizes.every((v,i)=>v===expect[i]))

      // buildBackbone empty sequence yields no points
      ok('buildBackbone empty sequence yields no points', buildBackbone('', 1).length === 0)

      // toyActivity deterministic for same inputs
      const t1 = toyActivity('ACACACAC', 'x')
      const t2 = toyActivity('ACACACAC', 'x')
      ok('toyActivity is deterministic for same inputs', t1 === t2)

      setLines(out)
    } catch(e: any){
      setLines([`FAIL - exception: ${e?.message||String(e)}`])
    }
  }

  const allPass = lines.length>0 && lines.every(l=>l.startsWith('PASS'))

  return (
    <Card className="mt-3">
      <CardHeader>
        <div className="flex items-center gap-2"><IconFilter /> <b>Tests panel</b></div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-2">
          <Button onClick={run}><IconWand /> Run tests</Button>
          {lines.length>0 && (
            <span className={allPass? 'text-green-600' : 'text-red-600'}>{allPass? 'All tests passed' : 'Some tests failed'}</span>
          )}
        </div>
        <ul className="text-sm space-y-1">
          {lines.map((l,i)=>(<li key={i}>{l}</li>))}
        </ul>
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
    <div className="p-4 max-w-6xl mx-auto font-sans">
      <h1 className="text-xl font-bold mb-3 flex items-center gap-2"><IconCube /> Text to Protein - classroom demo</h1>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><b>Controls</b></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <Label>Plain English prompt</Label>
                <Textarea value={prompt} onChange={(e: any)=>setPrompt(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Number of candidates</Label>
                  <Input type="number" value={count} min={1} max={64} onChange={(e: any)=>setCount(Number(e.target.value)||0)} />
                </div>
                <div>
                  <Label>Length in amino acids</Label>
                  <Input type="number" value={lengthAA} min={5} max={200} onChange={(e: any)=>setLengthAA(Number(e.target.value)||0)} />
                </div>
                <div>
                  <Label>Seed for reproducible runs</Label>
                  <Input type="number" value={seed} onChange={(e: any)=>setSeed(Number(e.target.value)||0)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={generate}><IconWand /> Generate</Button>
                <Button onClick={screen}><IconFilter /> Screen</Button>
                <Button onClick={lab}><IconFlask /> Lab test</Button>
                <Button onClick={reset}><IconRotate /> Reset</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><b>Quick setup</b></CardHeader>
          <CardContent>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              <li>npm create vite@latest text-to-protein -- --template react-ts</li>
              <li>cd text-to-protein</li>
              <li>npm i @react-three/fiber @react-three/drei three</li>
              <li>mkdir -p src/components/ui</li>
              <li>Paste UI shims and this App.tsx</li>
              <li>npm run dev and open http://localhost:5173</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><b>Results</b></CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-gray-600">Click Generate to create candidates. Use Screen to score and sort. Use Lab test to simulate wet lab results. Click a sequence or View to open 3D.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Sequence</th>
                      <th className="py-2 pr-2">Fold score</th>
                      <th className="py-2 pr-2">Pred activity</th>
                      <th className="py-2 pr-2">Lab percent</th>
                      <th className="py-2 pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r,idx)=> (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-2">{idx+1}</td>
                        <td className="py-2 pr-2">
                          <button title="Click to show 3D" className="underline" onClick={()=>setSel(r)}>{r.seq}</button>
                        </td>
                        <td className="py-2 pr-2 w-40">
                          <div className="flex items-center gap-2">
                            <span className="w-10 text-right">{r.fold.toFixed(1)}</span>
                            <div className="flex-1"><MiniBar value={r.fold} max={100} /></div>
                          </div>
                        </td>
                        <td className="py-2 pr-2 w-44">
                          <div className="flex items-center gap-2">
                            <span className="w-10 text-right">{r.pred.toFixed(1)}</span>
                            <div className="flex-1"><MiniBar value={r.pred} max={160} /></div>
                          </div>
                        </td>
                        <td className="py-2 pr-2 w-44">
                          {typeof r.lab === 'number' ? (
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-right">{r.lab.toFixed(1)}</span>
                              <div className="flex-1"><MiniBar value={r.lab} max={160} /></div>
                            </div>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="py-2 pr-2"><Button onClick={()=>setSel(r)}>View</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><b>3D viewer</b></CardHeader>
          <CardContent>
            {!sel ? (
              <div className="text-sm text-gray-600">Select a sequence to view a toy backbone. Colors: hydrophobic black, basic blue, acidic red, other green.</div>
            ) : (
              <div style={{ height: 360 }}>
                <Viewer seq={sel.seq} seed={seed} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><b>Learn and iterate</b></CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-gray-600">Run Screen to get rankings and explore hits.</div>
            ) : (
              <div className="space-y-2 text-sm">
                <div><b>Top 5</b></div>
                <ol className="list-decimal pl-5">
                  {rows.slice(0,5).map((r)=>(<li key={r.id} className="truncate">{r.seq} - {r.pred.toFixed(1)}</li>))}
                </ol>
                <div><b>Hit count</b>: {rows.filter(r=> (r.lab ?? 0) > 120).length} with lab percent above 120</div>
              </div>
            )}
          </CardContent>
        </Card>

        <TestsPanel />
      </div>
    </div>
  )
}
