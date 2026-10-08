/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // autoprefixer reads the browserslist from package.json and injects
    // vendor-prefixed CSS properties for the target browsers.
    // flex:true  → adds -webkit-flex prefixes for older Safari.
    // grid:false → CSS Grid autoprefixing is off (we don't use the old IE spec).
    autoprefixer: {
      flexbox: 'no-2009', // modern flexbox only; skips legacy -webkit-box syntax
      grid: false,
    },
  },
}

export default config
