export interface GovernanceResource {
  id: number
  name: string
  versions: { id: string; label: string; languages: { code: string; name: string }[] }[]
}
