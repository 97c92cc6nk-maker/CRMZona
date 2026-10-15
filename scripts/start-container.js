'use strict';

// A Timeweb stand has its own explicit flag. The normal application stays the default.
if (process.env.CRMZONA_DESIGN_PREVIEW === 'true') {
  require('./design-preview-server');
} else {
  require('../lib/app').startServer();
}
