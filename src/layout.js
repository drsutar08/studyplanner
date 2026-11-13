import { useWindowDimensions } from 'react-native';

// Window width from which screens put their content side by side. The sidebar takes about 260px of it,
// so this leaves roughly 900px for the two columns.
export const TWO_COLUMNS = 1180;

export const useTwoColumns = () => useWindowDimensions().width >= TWO_COLUMNS;
