export const primaryColor = '#f66f1c';
export const lightGreyColor = '#dcdddf';
export const darkGreyColor = '#949599';
export const whiteColor = '#FFFFF';
const theme = {
  token: {
    colorSplit: primaryColor,
    colorPrimary: primaryColor,
  },
  components: {
    Tabs: {
      // Seed Token
      itemActiveColor: primaryColor,
      itemSelectedColor: primaryColor,
      itemColor: '#FFFFF',
      itemHoverColor: primaryColor,
      inkBarColor: primaryColor,
    },
    Button: {
      // Seed Token
      defaultBorderColor: primaryColor,
      defaultColor: primaryColor,
      defaultHoverBg: primaryColor,
      defaultHoverColor: '#FFFFFF',
      defaultHoverBorderColor: primaryColor,
    },
  },
};

export default theme;
