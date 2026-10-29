import styles from './positioning-method.module.css';

export function PositioningMethod(){
 return <details className={styles.method}>
  <summary>Още три начина да намериш послание</summary>
  <ol>
   <li><span>01</span><div><h3>Търси промяната.</h3><p>Какво иска човекът да направи по-лесно?</p><a href="https://www.christenseninstitute.org/theory/jobs-to-be-done/" target="_blank" rel="noreferrer">Jobs to Be Done · Christensen Institute ↗</a></div></li>
   <li><span>02</span><div><h3>Хвани точния момент.</h3><p>Кога, къде и с кого възниква нуждата?</p><a href="https://marketingscience.info/news-and-insights/category-entry-points-in-a-business-to-business-b2b-world" target="_blank" rel="noreferrer">Ситуации на покупка · Ehrenberg-Bass ↗</a></div></li>
   <li><span>03</span><div><h3>Сравни с днешното решение.</h3><p>Какво използва човекът сега и какво реално променяш?</p><a href="https://aprildunford.substack.com/p/positioning-and-competition" target="_blank" rel="noreferrer">Позициониране · April Dunford ↗</a></div></li>
  </ol>
  <p className={styles.note}>Това са въпроси за проверка с клиенти. AI предлага хипотези.</p>
 </details>;
}
