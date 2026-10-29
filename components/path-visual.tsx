import type { LearningPath } from '@/lib/domain';

/** Each preview explains the work in the path, rather than decorating its category. */
export function PathVisual({ path }: { path: LearningPath }) {
  return <svg className="path-diagram" viewBox="0 0 300 200" aria-hidden="true">
    <rect width="300" height="200" rx="2" fill="#101217" />
    {path.id === 'automation' ? <>
      <path d="M64 58V103H150V145H236" fill="none" stroke="#7c8492" strokeWidth="2" />
      <rect x="28" y="30" width="82" height="48" rx="3" fill="#f4f5f7" />
      <path d="M43 46H95M43 54H79M43 62H87" stroke="#15171c" strokeWidth="2" />
      <rect x="111" y="83" width="82" height="42" rx="3" fill="#c91635" />
      <text x="152" y="109" textAnchor="middle" fill="white" fontSize="12">ПРАВИЛО</text>
      <rect x="195" y="124" width="78" height="42" rx="3" fill="#191d25" stroke="#9098a6" />
      <path d="m203 145 4 4 8-10" fill="none" stroke="#fff" strokeWidth="2" />
      <text x="245" y="149" textAnchor="middle" fill="white" fontSize="9">ПРОВЕРИ</text>
      <circle cx="64" cy="103" r="4" fill="#fff" /><circle cx="150" cy="145" r="4" fill="#c91635" />
    </> : path.id === 'ai-development' ? <>
      <rect x="32" y="25" width="236" height="149" rx="5" fill="#171a21" stroke="#697282" />
      <path d="M32 48H268" stroke="#697282" /><circle cx="46" cy="37" r="3" fill="#c91635" />
      <path d="M60 69H150M60 78H119" stroke="#fff" strokeWidth="3" />
      <rect x="60" y="94" width="181" height="31" rx="2" fill="#090a0d" stroke="#555e6c" />
      <text x="72" y="114" fill="#bfc5cf" fontSize="11">Една потребителска задача</text>
      <path d="M60 144H157" stroke="#7b8493" /><rect x="185" y="137" width="56" height="21" rx="2" fill="#f5f5f7" />
      <path d="M204 147H222m-5-4 5 4-5 4" stroke="#17191f" fill="none" />
    </> : path.id === 'ai-for-business' ? <>
      <text x="28" y="39" fill="#bfc5cf" fontSize="11">СЕГА</text>
      <path d="M31 67H269" stroke="#67707e" strokeWidth="2" />
      {[41,85,129,173,217,261].map(x => <rect key={x} x={x-9} y="58" width="18" height="18" fill="#c7cdd6" />)}
      <text x="28" y="113" fill="#fff" fontSize="11">СЛЕД ПРОМЯНАТА</text>
      <path d="M41 142H261" stroke="#9a3d4e" strokeWidth="2" />
      <rect x="32" y="133" width="18" height="18" fill="#c7cdd6" />
      <rect x="104" y="127" width="94" height="31" rx="2" fill="#c91635" />
      <text x="151" y="147" textAnchor="middle" fill="#fff" fontSize="10">АВТОМАТИЗИРАЙ</text>
      <path d="m249 141 7 7 12-15" fill="none" stroke="#fff" strokeWidth="2" />
      <text x="239" y="179" fill="#bfc5cf" fontSize="10">ПРОВЕРИ</text>
    </> : <>
      <path d="M43 145 105 110 170 110 247 53" fill="none" stroke="#929baa" strokeWidth="2" />
      {[{x:43,y:145},{x:105,y:110},{x:170,y:110},{x:247,y:53}].map((point,index)=><g key={index}><rect x={point.x-12} y={point.y-12} width="24" height="24" fill={index===0?'#c91635':'#e7e9ee'}/><text x={point.x} y={point.y+4} textAnchor="middle" fill={index===0?'#fff':'#17191f'} fontSize="11">{index+1}</text></g>)}
      <text x="27" y="38" fill="#f5f5f7" fontSize="12">ОТ УРОКА КЪМ ПРАКТИКАТА</text>
    </>}
  </svg>;
}
