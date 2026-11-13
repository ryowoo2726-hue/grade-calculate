// Matching files are served by Workers Static Assets before this fallback.
export default {
  fetch() { return new Response('Not found', { status: 404 }); },
};
