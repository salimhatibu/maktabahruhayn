"use client"

import { Button, Input, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { KENYA_COUNTIES } from "@maktabah/shared"
import { ErrorNote, Field, Section } from "@/components/kit"
import { api, useApi } from "@/lib/api"

type Town = { id: number; county_code: string; name: string }

const selectClass =
  "bg-ui-bg-field border-ui-border-base text-ui-fg-base h-8 w-full rounded-md border px-2 text-sm shadow-borders-base"

/** Towns offered at checkout for each county. A town is priced at its county's rate. */
export function TownsSection() {
  const { data, error, reload } = useApi<{ towns: Town[] }>("/api/towns")
  const [county, setCounty] = useState("nairobi")
  const [name, setName] = useState("")
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [filter, setFilter] = useState("")

  const countyName = KENYA_COUNTIES.find((item) => item.code === county)?.name
  const towns = (data?.towns || []).filter(
    (town) => town.county_code === county && town.name.toLowerCase().includes(filter.trim().toLowerCase())
  )

  const add = async () => {
    if (adding) return
    const names = name.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    if (!names.length) return
    setAdding(true)
    const failed: string[] = []
    try {
      for (const town of names) {
        try {
          await api("/api/towns", { method: "POST", json: { county, name: town } })
        } catch (e) {
          failed.push(town)
          toast.error(`${town}: ${(e as Error).message}`)
        }
      }
      setName(failed.join("\n"))
      if (names.length > failed.length) {
        setFilter("")
        toast.success(`${names.length - failed.length} town(s) added to ${countyName}`)
      }
      reload()
    } finally {
      setAdding(false)
    }
  }

  const remove = async (town: Town) => {
    if (!window.confirm(`Remove ${town.name} from ${countyName}?`)) return
    setRemoving(town.id)
    try {
      await api(`/api/towns?id=${town.id}`, { method: "DELETE" })
      toast.success(`${town.name} removed`)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Section
      title="Delivery towns"
      description="Towns customers can pick at checkout, beside each county's sub-counties. A town takes the delivery rate of the county it is listed under, wherever it really is."
    >
      <ErrorNote message={error} />
      <div className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-3">
        <Field label="County">
          <select className={selectClass} value={county} disabled={adding} onChange={(e) => setCounty(e.target.value)}>
            {KENYA_COUNTIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="New towns (one per line)">
          <textarea
            className={`${selectClass} h-20 py-2`}
            value={name}
            disabled={adding}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button size="small" isLoading={adding} disabled={!name.trim() || adding} onClick={add}>
            Add towns
          </Button>
        </div>
      </div>
      <div className="px-6 pb-2">
        <Input placeholder={`Search ${countyName} towns`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="mr-scroll-x" style={{ maxHeight: 360, overflowY: "auto" }}>
        <Table>
          <Table.Body>
            {towns.map((town) => (
              <Table.Row key={town.id}>
                <Table.Cell>{town.name}</Table.Cell>
                <Table.Cell className="text-right">
                  <Button size="small" variant="danger" isLoading={removing === town.id} onClick={() => remove(town)}>
                    Delete
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
      {!towns.length ? (
        <Text size="small" className="text-ui-fg-muted px-6 py-4">
          No added towns for {countyName}.
        </Text>
      ) : null}
    </Section>
  )
}
