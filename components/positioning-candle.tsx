import {useId} from 'react';
import styles from './positioning-candle.module.css';

/** Authored illustration of the supplied hypothetical positioning case. No timer claim. */
export function PositioningCandle(){
 const id=useId().replace(/:/g,'');
 return <div className={styles.scene} aria-hidden="true"><svg viewBox="0 0 540 260" focusable="false">
  <defs>
   <linearGradient id={`${id}-wax`} x1="0" x2="1"><stop stopColor="#272a2f"/><stop offset=".42" stopColor="#585b61"/><stop offset=".66" stopColor="#24272c"/><stop offset="1" stopColor="#101115"/></linearGradient>
   <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor="#dedbd4"/></linearGradient>
   <radialGradient id={`${id}-light`}><stop stopColor="#ffd8a6" stopOpacity=".65"/><stop offset="1" stopColor="#ffd8a6" stopOpacity="0"/></radialGradient>
  </defs>
  <ellipse cx="284" cy="218" rx="205" ry="14" fill="#101115" opacity=".1"/>
  <path d="M291 132 488 151 447 230 248 208Z" fill="#24272d"/>
  <path d="m289 126 198 18-42 76-198-20Z" fill={`url(#${id}-paper)`}/>
  <path d="m323 134-39 71" fill="none" stroke="#c8c4bc" strokeWidth="1"/>
  {[0,1,2,3].map(index=><path key={index} d={`m${345-index*6} ${150+index*11} 100 9`} fill="none" stroke={index===1?'#bf1235':'#b5b3ad'} strokeWidth={index===1?3:2}/>)}
  <path d="m50 179 99-24 58 34-99 26Z" fill="#080a0e" stroke="#454a53" strokeWidth="1.5"/>
  <path d="m57 177 91-21 48 29-91 24Z" fill="#23272e"/>
  <circle cx="77" cy="178" r="4" fill="#626b78"/><circle cx="89" cy="175" r="4" fill="#626b78"/>
  <circle cx="232" cy="72" r="61" fill={`url(#${id}-light)`}/>
  <ellipse cx="232" cy="210" rx="39" ry="9" fill="#101115"/>
  <path d="M203 113h58v90c0 11-58 11-58 0Z" fill={`url(#${id}-wax)`}/>
  <ellipse cx="232" cy="113" rx="29" ry="8" fill="#666970"/>
  <ellipse cx="232" cy="113" rx="20" ry="4" fill="#393c42"/>
  <path d="M232 109v-10" stroke="#0c0d10" strokeWidth="2.5"/>
  <g className={styles.flame}><path d="M232 53c11 19 21 33 4 45-23 4-24-16-4-45Z" fill="#cf6339"/><path d="M232 72c9 12 12 20 1 25-12-1-13-10-1-25Z" fill="#ffdeb4"/></g>
  <path d="M219 145v30h26v-30" fill="none" stroke="#b7bcc7" strokeWidth="1" opacity=".5"/>
  <path d="M212 222h41" stroke="#c31538" strokeWidth="3"/>
 </svg></div>;
}
