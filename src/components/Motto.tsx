type Props = {
  /** green when used as a section rule on the shop page */
  green?: boolean
  /** spacing variant when it bookends a page */
  place?: 'top' | 'bottom'
}

/** The three-line motto. White in the hero, green when bookending a section. */
export default function Motto({ green = false, place }: Props) {
  return (
    <p className={`tagline${green ? ' g' : ''}${place ? ` ${place}` : ''}`}>
      <span>/collect_chips</span>
      <span>/pay_4_compute</span>
      <span>/stay_ALIVE_on_chain</span>
    </p>
  )
}
