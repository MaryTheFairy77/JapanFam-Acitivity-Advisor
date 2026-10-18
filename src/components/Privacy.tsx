export default function Privacy({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-stone-400 ${className}`}>
      🔒 <b>Privacy:</b> only first names or nicknames are stored. No surnames, phone numbers or emails. Everything sits in a
      private database that only opens for phones that entered the family code (enforced by row-level security; the code is stored hashed).
      Nothing is public or shared with anyone outside the family.
    </p>
  )
}
