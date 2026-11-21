import math
R='#c8102e'; INDIGO='#1f3a6d'  # Plan stamp is indigo (ai-iro), Maryam 21 Nov
K='#2b2420'; P='#fbf3e6'; RAY='#ead9c4'
W,H=120,148
def paper_path():
    r=3.4; step=8.6
    def holes(length):
        n=int((length-8)//step); return [4+i*(length-8)/n for i in range(n+1)]
    d=f"M0 0"
    for x in holes(W)[1:-1]: d+=f" L{x-r:.2f} 0 A{r} {r} 0 0 0 {x+r:.2f} 0"
    d+=f" L{W} 0"
    for y in holes(H)[1:-1]: d+=f" L{W} {y-r:.2f} A{r} {r} 0 0 0 {W} {y+r:.2f}"
    d+=f" L{W} {H}"
    for x in reversed(holes(W)[1:-1]): d+=f" L{x+r:.2f} {H} A{r} {r} 0 0 0 {x-r:.2f} {H}"
    d+=f" L0 {H}"
    for y in reversed(holes(H)[1:-1]): d+=f" L0 {y+r:.2f} A{r} {r} 0 0 0 0 {y-r:.2f}"
    return d+" Z"
def rays(cx,cy):
    return ''.join(f'<line x1="{cx}" y1="{cy}" x2="{cx+120*math.cos(a):.1f}" y2="{cy+120*math.sin(a):.1f}" stroke="{RAY}" stroke-width="1.6"/>' for a in [i*math.pi/18 for i in range(36)])
def postmark():
    waves=''.join(f'<path d="M{70} {14+i*6} q5 -3 10 0 t10 0 t10 0 t10 0 t10 0 t10 0" fill="none" stroke="{K}" stroke-opacity=".28" stroke-width="1"/>' for i in range(4))
    return f'<g>{waves}<circle cx="99" cy="24" r="15" fill="none" stroke="{K}" stroke-opacity=".32" stroke-width="1.2"/><circle cx="99" cy="24" r="11.5" fill="none" stroke="{K}" stroke-opacity=".32" stroke-width=".7" stroke-dasharray="1.6 1.6"/><text x="99" y="27" text-anchor="middle" font-size="7" font-family="Georgia, serif" fill="{K}" fill-opacity=".38">2026</text></g>'
def frame(value, ja, en, art, uid):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{en}">
<defs>
<clipPath id="art-{uid}"><rect x="14" y="14" width="92" height="98"/></clipPath></defs>
<g><path d="{paper_path()}" fill="{P}" stroke="#e2d3c0" stroke-width=".6"/>
<rect x="9" y="9" width="{W-18}" height="{H-18}" fill="none" stroke="{R}" stroke-width="2.4"/>
<rect x="12.5" y="12.5" width="{W-25}" height="{H-25}" fill="none" stroke="{R}" stroke-width=".8"/>
<g clip-path="url(#art-{uid})">{rays(60,66)}{art}</g>
{postmark()}
<rect x="14" y="14" width="24" height="15" fill="{R}"/><text x="26" y="25.5" text-anchor="middle" font-size="10" font-weight="700" font-family="Georgia, serif" fill="#fff">{value}</text>
<rect x="14" y="114" width="92" height="20" fill="{R}"/>
<text x="60" y="128" text-anchor="middle" font-size="10.5" font-weight="700" letter-spacing=".5" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',Georgia,serif" fill="#fff">{ja}</text>
</g></svg>'''
# ramen
ramen=f'''
<g stroke="{R}" stroke-linecap="round" stroke-linejoin="round" fill="none">
<path d="M78 62 q-3 -5 0 -9 q3 -4 0 -8" stroke-width="1.4" opacity=".6"/><path d="M86 64 q-3 -5 0 -9 q3 -4 0 -8" stroke-width="1.4" opacity=".6"/>
<line x1="44" y1="24" x2="98" y2="40" stroke="{K}" stroke-width="2.6"/><line x1="46" y1="30" x2="99" y2="46" stroke="{K}" stroke-width="2.6"/>
<path d="M55 30 C51 40 59 46 55 56 C52 64 58 68 55 76" stroke-width="2.2"/>
<path d="M61 32 C57 42 65 48 61 58 C58 66 64 70 61 78" stroke-width="2.2"/>
<path d="M67 34 C63 44 71 50 67 60 C64 68 70 72 67 80" stroke-width="2.2"/>
</g>
<path d="M24 76 H96 C96 96 80 106 60 106 C40 106 24 96 24 76 Z" fill="#fff" stroke="{R}" stroke-width="2.4"/>
<path d="M26 84 L32 90 L38 84 L44 90 L50 84 L56 90 L62 84 L68 90 L74 84 L80 90 L86 84 L92 90" fill="none" stroke="{R}" stroke-width="1.4"/>
<rect x="49" y="105" width="22" height="5" rx="1.5" fill="{R}"/>
<ellipse cx="60" cy="76" rx="36" ry="5" fill="#fff" stroke="{R}" stroke-width="2"/>
<ellipse cx="80" cy="72" rx="8" ry="5.5" fill="#fff" stroke="{R}" stroke-width="1.8"/><circle cx="80" cy="72.5" r="3" fill="{R}"/>
<circle cx="40" cy="72" r="6" fill="#fff" stroke="{R}" stroke-width="1.8"/><path d="M40 72 m-2.6 0 a2.6 2.6 0 1 1 2.6 2.6 a1.4 1.4 0 1 1 -1.4 -1.4" fill="none" stroke="{R}" stroke-width="1.2"/>
<path d="M50 74 l4 -9 l4 9" fill="none" stroke="{R}" stroke-width="1.6" stroke-linejoin="round"/>
'''
torii=f'''
<circle cx="60" cy="56" r="24" fill="#f6c9cf"/>
<path d="M10 112 L46 78 Q60 66 74 78 L110 112 Z" fill="#fff" stroke="{R}" stroke-width="2"/>
<path d="M41 84 L48 81 L54 86 L60 80 L66 86 L72 81 L79 84" fill="none" stroke="{R}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M18 38 Q60 46 102 38 L99 46 Q60 52 21 46 Z" fill="{R}"/>
<rect x="24" y="47" width="72" height="5" fill="{K}"/>
<rect x="30" y="60" width="60" height="5" fill="{R}"/>
<rect x="36" y="51" width="7" height="56" fill="{R}"/><rect x="77" y="51" width="7" height="56" fill="{R}"/>
<rect x="34" y="104" width="11" height="4" fill="{K}"/><rect x="75" y="104" width="11" height="4" fill="{K}"/>
<rect x="56.5" y="52" width="7" height="8" fill="{K}"/>
<path d="M44 68 Q60 74 76 68" fill="none" stroke="{K}" stroke-width="2"/>
<path d="M50 71 l2 3 l-2 3 l2 3" fill="#fff" stroke="{K}" stroke-width="1"/><path d="M60 72.5 l2 3 l-2 3 l2 3" fill="#fff" stroke="{K}" stroke-width="1"/><path d="M70 71 l2 3 l-2 3 l2 3" fill="#fff" stroke="{K}" stroke-width="1"/>
'''
def blossom(cx,cy,s):
    petal="M0 0 C-3 -3 -4 -7 -2 -9 L0 -7.6 L2 -9 C4 -7 3 -3 0 0 Z"
    return f'<g transform="translate({cx} {cy}) scale({s})">'+''.join(f'<path d="{petal}" transform="rotate({i*72})" fill="#fff" stroke="{R}" stroke-width="1"/>' for i in range(5))+f'<circle r="1.6" fill="{R}"/></g>'
plan=f'''
<path d="M82 110 C86 98 92 92 100 86" fill="none" stroke="{K}" stroke-width="2"/><path d="M89 99 C93 98 97 100 101 103" fill="none" stroke="{K}" stroke-width="1.4"/>
<rect x="32" y="30" width="54" height="76" rx="5" fill="{R}"/>
<rect x="36" y="36" width="46" height="66" rx="2" fill="#fff" stroke="{R}" stroke-width="1"/>
<rect x="47" y="25" width="24" height="11" rx="3" fill="{K}"/><circle cx="59" cy="28.5" r="2" fill="{P}"/>
''' + ''.join(f'<rect x="41" y="{44+i*13}" width="8" height="8" rx="1.2" fill="#fff" stroke="{R}" stroke-width="1.6"/>' + (f'<path d="M42.5 {48+i*13} l2.4 2.6 l5 -6" fill="none" stroke="{R}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' if i<3 else '') + f'<line x1="53" y1="{48+i*13}" x2="{76 if i%2==0 else 70}" y2="{48+i*13}" stroke="{K}" stroke-width="2" stroke-linecap="round"/>' for i in range(4)) + blossom(94,88,1.0)+blossom(86,100,.8)+blossom(99,101,.65)
files={'stamp-food.svg':frame('80','食 · 麺','Food',ramen,'f'),'stamp-activities.svg':frame('110','遊 · 鳥居','Activities',torii,'a'),'stamp-plan.svg':frame('140','旅 · 予定','Plan',plan,'p').replace(R, INDIGO)}
for k,v in files.items(): open(k,'w').write(v)
