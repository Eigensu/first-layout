import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { getFontFamily } from '../../utils/fonts';

interface TextProps extends RNTextProps {
  weight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  italic?: boolean;
}

export const Text: React.FC<TextProps> = ({ 
  style, 
  weight = 'normal', 
  italic = false, 
  ...props 
}) => {
  const fontFamily = getFontFamily(weight, italic);
  
  const textStyle: TextStyle = {
    fontFamily,
    ...(Array.isArray(style) ? Object.assign({}, ...style) : style),
  };

  return <RNText style={textStyle} {...props} />;
};

export default Text;