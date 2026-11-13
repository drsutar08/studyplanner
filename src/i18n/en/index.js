// English: the source language. Each file holds one area of the app; they are merged here.
import common from './common';
import core from './core';
import today from './today';
import calendar from './calendar';
import manage from './manage';

export default { ...common, ...core, ...today, ...calendar, ...manage };
