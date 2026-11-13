// Translation of the English files in ../en, one file per area. Missing keys fall back to English.
import common from './common';
import core from './core';
import today from './today';
import calendar from './calendar';
import manage from './manage';

export default { ...common, ...core, ...today, ...calendar, ...manage };
