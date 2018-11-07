import moduleAlias from 'module-alias';

moduleAlias.addAliases({
  src: __dirname,
});

import { watch } from './nodemon';

watch();
