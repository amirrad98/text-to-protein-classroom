export function Button({ children, className = '', ...props }: any){
  const base = 'px-3 py-2 rounded-xl border';
  return <button className={`${base} ${className}`} {...props}>{children}</button>
}