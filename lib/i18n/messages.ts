import en from './dictionaries/en';
import fa from './dictionaries/fa';
import ar from './dictionaries/ar';
import ru from './dictionaries/ru';
import zh from './dictionaries/zh';
import es from './dictionaries/es';
import pt from './dictionaries/pt';
import de from './dictionaries/de';
import tr from './dictionaries/tr';
import da from './dictionaries/da';
import sv from './dictionaries/sv';
import th from './dictionaries/th';

const messages = { en, fa, ar, ru, zh, es, pt, de, tr, da, sv, th } as const;

export type Messages = typeof messages['en'];
export type MessageKey = keyof Messages;

export default messages;
