(function () {
  try {
    self.onmessage = (e) => {
      const { id, template, vars } = e.data || {};
      try {
        let content = template || '';
        for (const k in (vars || {})) content = content.replace(new RegExp('{{\\s*' + k + '\\s*}}', 'g'), String(vars[k]));
        self.postMessage({ id, content });
      } catch (err) {
        self.postMessage({ id, error: String(err) });
      }
    };
  } catch (e) {
    console.log('Mail template worker failed to initialize', e);
  }
})();