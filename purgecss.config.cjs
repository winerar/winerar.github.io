/* eslint-disable no-undef */
module.exports = {
  content: ['./dist/*.html', './dist/assets/*.js'],
  css: ['./dist/assets/*.css'],
  output: "./dist/assets/",
  safelist: {
    standard: [/active/, "navbar-collapse", /collapse/, "collapsing", /show/],
    deep: [/^dropdown/, /^modal/, /^carousel/, /collapse/, /navbar/]
  }
}