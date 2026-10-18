/** Short privacy line + expandable full "Privacy & security" policy. Keep this accurate if the setup changes. */
export default function Privacy({ className = '' }: { className?: string }) {
  return (
    <div className={`text-[11px] leading-relaxed text-stone-500 ${className}`}>
      <p>
        🔒 <b>Private to our family.</b> First names or nicknames only. The database only opens for phones that entered the family code.
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer font-medium text-torii">Privacy &amp; security (T&amp;Cs)</summary>
        <div className="mt-2 space-y-2 rounded-xl bg-white/70 p-3 text-stone-600">
          <p><b>What we store:</b> your first name (or a nickname you choose), an emoji avatar, whether you're an adult, teen or kid,
            your votes, which places you're going to, and places the family adds. <b>Never</b> stored: surnames, phone numbers, emails,
            passwords, photos, or your location.</p>
          <p><b>Who can see it:</b> only phones that entered the family code. This is enforced inside the database itself
            (row-level security). Without the code the database returns nothing, even to someone who has the link.
            Everyone in the family can see everything in the app, so please don't add passport numbers, bookings or other sensitive info.</p>
          <p><b>How it's protected:</b></p>
          <ul className="list-disc space-y-1 pl-4">
            <li>The family code and the trip-planner code are stored only as one-way hashes (bcrypt), never in plain text.</li>
            <li>After 5 wrong codes a phone is locked out for 15 minutes, and each wrong try is slowed down.</li>
            <li>Only trip planners (with their own code) can delete places or add people. Everyone else can only change nicknames and avatars, and add, edit, vote on and tick places.</li>
            <li>The database rejects unsafe links and oversized or invalid entries.</li>
            <li>All traffic is encrypted (HTTPS), and the database provider encrypts stored data.</li>
            <li>No ads, no analytics and no tracking cookies. Your phone only remembers who you picked and its family-code session.</li>
          </ul>
          <p><b>Where it lives:</b> a private Supabase (Postgres) database owned by Maryam, in an Asia-Pacific region. The website is hosted on Vercel.
            Map tiles come from OpenStreetMap and fonts from Google Fonts. "Find pin" sends only the place name you search to OpenStreetMap.</p>
          <p><b>Your choices:</b> use a nickname instead of your name any time (tap your name at the top right). Ask Maryam to remove
            your data or the whole trip database at any time, including after the trip.</p>
        </div>
      </details>
    </div>
  )
}
