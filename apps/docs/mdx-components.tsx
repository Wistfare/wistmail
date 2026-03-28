import type { MDXComponents } from 'mdx/types'
import defaultComponents from 'fumadocs-ui/mdx'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    Tabs,
    Tab,
    ...components,
  }
}
