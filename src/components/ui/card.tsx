export function Card({ children, className = '' }: any){return <div className={'rounded-xl border p-3 '+className}>{children}</div>}
export function CardHeader({ children }: any){return <div className="mb-2">{children}</div>}
export function CardContent({ children, className = '' }: any){return <div className={className}>{children}</div>}