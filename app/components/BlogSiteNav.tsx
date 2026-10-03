import Link from "next/link";
/* eslint-disable @next/next/no-img-element */

export default function BlogSiteNav(){return <nav className="blog-site-nav">
 <Link href="/#home" className="blog-site-logo" aria-label="The Klinique home"><img src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique"/></Link>
 <div className="blog-site-links">
  <Link href="/#home">Home</Link><Link href="/#services">Services</Link><Link href="/#about">About</Link><Link href="/#gallery">Gallery</Link>
  <details><summary>More <i className="fa-solid fa-chevron-down"/></summary><div><Link href="/#blog"><i className="fa-regular fa-newspaper"/> Blogs</Link><Link href="/#socials"><i className="fa-regular fa-heart"/> Socials</Link><Link href="/#faq"><i className="fa-regular fa-circle-question"/> FAQ</Link><Link href="/#contact"><i className="fa-regular fa-envelope"/> Contact</Link></div></details>
 </div>
 <div className="blog-site-actions"><Link href="/auth" className="blog-site-signin"><i className="fa-regular fa-user"/><span>Sign in</span></Link><Link href="/?book=1" className="blog-site-book"><i className="fa-solid fa-calendar-plus"/><span>Book now</span></Link></div>
 </nav>}
