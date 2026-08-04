/**
 * Google Analytics (GA4) configuration.
 *
 * The loader tag in index.html is Google's own and stays as they publish it;
 * this is the config half of the snippet, kept in a file rather than an inline
 * block. It is a classic script, not a module, so it runs before the deferred
 * app code and the queue is ready whenever the loader lands.
 */

window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

gtag('js', new Date());
gtag('config', 'G-WXB7ZH58X5');
