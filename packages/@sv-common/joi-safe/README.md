# joi-safe

> Disallow unsafe HTML and control characters in a `Joi.string()`.

## Usage

```js
import JoiBase from 'joi';
import JoiSafe from '@common/joi-safe';

const Joi = JoiBase.extend(JoiSafe);

Joi.string().safe();
Joi.string().safe(true); // disallow HTML

Joi.string().safeMultiline();
Joi.string().safeMultiline(true); // disallow HTML
```

**Note**: `safeMultiline()` is for whitespace characters, not HTML (`<br>`, etc).
