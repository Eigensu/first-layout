import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { fonts } from '../../utils/fonts';

interface BannerTextProps extends RNTextProps {
  children: React.ReactNode;
}

/**
 * BannerText renders text in the bold Saira Semi Condensed face for a
 * sports-style banner/headline aesthetic (think tournament campaign lockups).
 *
 * The look comes from the bold weight + uppercase + a subtle 0.5 tracking.
 */
export const BannerText: React.FC<BannerTextProps> = ({ style, ...props }) => {
  const textStyle: TextStyle = {
    fontFamily: fonts.sairaBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Array.isArray(style) ? Object.assign({}, ...style) : style),
  };

  return <RNText style={textStyle} {...props} />;
};

export default BannerText;
