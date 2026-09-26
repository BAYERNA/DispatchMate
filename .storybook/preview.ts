import type { Preview } from '@storybook/react-vite'
import '../packages/design-system/tokens.css'
import '../packages/design-system/components.css'

const preview:Preview={
  parameters:{
    controls:{matchers:{color:/(background|color)$/i,date:/Date$/i}},
    a11y:{test:'todo'},
    layout:'centered',
  },
}

export default preview
