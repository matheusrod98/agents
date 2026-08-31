---
name: drawio
description: Use when creating or editing draw.io diagrams, converting Mermaid to drawio, or exporting a diagram to PNG, SVG, or PDF. Authors .drawio XML directly and renders with the drawio desktop CLI — no diagram MCP exists anymore.
---

# draw.io CLI

A `.drawio` file is XML (`mxGraphModel`). Author it with `write`/`edit`, then
export with the `drawio` desktop CLI. Nothing touches the network.

## Flow

1. Write the diagram XML to `<name>.drawio`.
2. Export — headless on this machine, so wrap in xvfb:
   ```sh
   xvfb-run -a drawio --no-sandbox --disable-gpu -x -f svg -o out.svg diagram.drawio
   ```
   Formats: `-f png|svg|pdf|xml`.
3. Editable PNG (XML embedded — reopens in draw.io): add `-e -b 10`
   (embed + 10px border).
4. Mermaid source converts directly, then auto-layouts:
   ```sh
   drawio -x -f xml -o diagram.drawio diagram.mmd
   drawio -x -f xml --layout verticalFlow -o diagram.drawio diagram.drawio
   ```

## Skeleton

```xml
<mxfile>
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1" page="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Step" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="3" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="2" target="4">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="Next" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="240" y="40" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Style cheatsheet

The MCP shape-search is gone; these cover most diagrams:

- Box: `rounded=1;whiteSpace=wrap;html=1;`
- Ellipse: `ellipse;whiteSpace=wrap;html=1;`
- Decision: `rhombus;whiteSpace=wrap;html=1;`
- Orthogonal edge: `edgeStyle=orthogonalEdgeStyle;html=1;rounded=1;`
- Dashed edge: `dashed=1;html=1;endArrow=block;`
- Label-only edge: `edgeStyle=orthogonalEdgeStyle;html=1;` + `value="yes"`

## Gotchas

- Every `mxCell` needs a unique `id`; edges reference `source`/`target` ids.
- Export exits non-zero on invalid XML — validate by exporting before
  committing a diagram change.
- Render PNG/SVG into the repo only when asked; the `.drawio` file is the
  source of truth.
