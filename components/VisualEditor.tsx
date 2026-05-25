import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { toPng, toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { SitemapNode } from '../types';
import { Search, ZoomIn, ZoomOut, Maximize, ArrowRight, ArrowDown, Share2, Image as ImageIcon, FileText, Clipboard, Check, Loader2, Hash, Network } from 'lucide-react';

interface VisualEditorProps {
  data: SitemapNode;
  onSelectNode: (node: SitemapNode) => void;
  selectedUrl: string | null;
}

type Orientation = 'horizontal' | 'vertical';

const NODE_WIDTH = 280;
// Base height for nodes with no sections (Header + Footer + Padding)
const BASE_NODE_HEIGHT = 120;
const SECTION_ROW_HEIGHT = 28;
const SECTIONS_HEADER_HEIGHT = 24;

const VisualEditor: React.FC<VisualEditorProps> = ({ data, onSelectNode, selectedUrl }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  const [orientation, setOrientation] = useState<Orientation>('vertical');
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Export State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success'>('idle');

  const getNodeHeight = (nodeData: SitemapNode) => {
      const sections = nodeData.data.sections || [];
      if (sections.length === 0) return BASE_NODE_HEIGHT;
      // Add extra padding at bottom
      return BASE_NODE_HEIGHT + SECTIONS_HEADER_HEIGHT + (sections.length * SECTION_ROW_HEIGHT) + 10;
  };

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setDimensions({
          width: wrapperRef.current.clientWidth,
          height: wrapperRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g = svg.append("g");
    gRef.current = g;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 2])
      .on("zoom", (event) => g.attr("transform", event.transform));
    zoomRef.current = zoom;
    svg.call(zoom as any);
    
    // Initial position
    const initialY = orientation === 'vertical' ? 100 : dimensions.height / 2;
    const initialX = orientation === 'vertical' ? dimensions.width / 2 : 100;
    
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(initialX, initialY).scale(0.8));
  }, [orientation, dimensions]);

  useEffect(() => {
    if (!data || !gRef.current || !svgRef.current) return;
    const g = gRef.current;
    const t = d3.transition().duration(500);
    const root = d3.hierarchy(data);
    
    // 1. Calculate and store dynamic height for each node
    root.descendants().forEach((d) => {
        (d as any)._height = getNodeHeight(d.data);
    });

    let treeLayout;
    
    if (orientation === 'horizontal') {
        // Horizontal Layout
        // Find the tallest node to ensure rows don't overlap vertically
        const maxNodeHeight = d3.max(root.descendants(), d => (d as any)._height) || BASE_NODE_HEIGHT;
        
        // NodeSize takes [y, x] for horizontal tree logic (before swap)
        // y: vertical spacing (height of node + gap)
        // x: horizontal spacing (width of node + connector gap)
        const nodeSeparationY = maxNodeHeight + 40; 
        const levelSeparationX = 400; 

        treeLayout = d3.tree<SitemapNode>()
            .nodeSize([nodeSeparationY, levelSeparationX]) 
            .separation((a, b) => a.parent === b.parent ? 1.1 : 1.2);
            
        treeLayout(root);
        
        // No complex shifting needed for horizontal x-axis (depth) as width is fixed (NODE_WIDTH)
    } else {
        // Vertical Layout
        // NodeSize takes [x, y]
        // x: horizontal spacing (width + gap)
        // y: vertical spacing (placeholder, we will override)
        
        const nodeSeparationX = NODE_WIDTH + 60; 
        const placeholderLevelY = 100; // Will be ignored by our custom logic

        treeLayout = d3.tree<SitemapNode>()
            .nodeSize([nodeSeparationX, placeholderLevelY])
            .separation((a, b) => a.parent === b.parent ? 1.1 : 1.3);

        treeLayout(root);

        // Custom Layout Adjustment for Variable Heights (Vertical Orientation)
        // We need to push levels down based on the max height of the previous level
        
        // 1. Group by depth
        const nodesByDepth: { [key: number]: d3.HierarchyNode<SitemapNode>[] } = {};
        root.descendants().forEach(d => {
            if (!nodesByDepth[d.depth]) nodesByDepth[d.depth] = [];
            nodesByDepth[d.depth].push(d);
        });

        // 2. Calculate Y start position for each depth
        const levelYOffsets: { [key: number]: number } = {};
        levelYOffsets[0] = 0; // Root starts at 0

        let maxDepth = d3.max(root.descendants(), d => d.depth) || 0;
        
        for (let i = 0; i < maxDepth; i++) {
            const currentLevelNodes = nodesByDepth[i];
            const maxH = d3.max(currentLevelNodes, d => (d as any)._height) || BASE_NODE_HEIGHT;
            // Next level starts after max height of this level + gap
            levelYOffsets[i + 1] = levelYOffsets[i] + maxH + 100; // 100px gap for arrows
        }

        // 3. Apply new Y positions
        root.descendants().forEach(d => {
            d.y = levelYOffsets[d.depth];
        });
    }

    const linksData = root.links();
    const link = g.selectAll<SVGPathElement, d3.HierarchyLink<SitemapNode>>(".link")
      .data(linksData, (d) => `${d.source.data.fullUrl}-${d.target.data.fullUrl}`);

    link.enter().append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", "2px")
      .attr("d", d => getStepPath(d, orientation, true))
      .merge(link as any)
      .transition(t as any)
      .attr("d", d => getStepPath(d, orientation));

    link.exit().remove();

    const nodesData = root.descendants();
    const node = g.selectAll<SVGForeignObjectElement, d3.HierarchyNode<SitemapNode>>(".node")
      .data(nodesData, (d) => d.data.fullUrl);

    const nodeEnter = node.enter().append("foreignObject")
      .attr("class", "node")
      .attr("width", NODE_WIDTH)
      .style("overflow", "visible")
      // Start position (animation)
      .attr("height", d => (d as any)._height)
      .attr("x", d => (orientation === 'vertical' ? d.x : d.y) - NODE_WIDTH / 2)
      .attr("y", d => (orientation === 'vertical' ? d.y : d.x) - (d as any)._height / 2);

    nodeEnter.append("xhtml:div")
      .attr("class", "w-full h-full")
      .html(d => renderNodeHtml(d, false));

    node.merge(nodeEnter as any)
      .transition(t as any)
      .attr("height", d => (d as any)._height)
      // For vertical: centered on X, top is Y
      // Wait, D3 tree y is usually the center or top depending.
      // In our custom logic `levelYOffsets`, we treat `d.y` as the TOP of the row.
      // So we don't subtract height/2 for vertical y.
      .attr("x", d => (orientation === 'vertical' ? d.x : d.y) - NODE_WIDTH / 2)
      .attr("y", d => {
          if (orientation === 'vertical') {
              // d.y is the top of the level
              return d.y; 
          } else {
              // Horizontal: d.x is depth (left), d.y is vertical position (center)
              return d.x - NODE_WIDTH / 2; // Actually horizontal swap
          }
      });
      
    // Fix positions separately due to conditional logic in transitions being tricky inline
    g.selectAll(".node").transition(t as any)
        .attr("x", (d: any) => (orientation === 'vertical' ? d.x : d.y) - NODE_WIDTH / 2)
        .attr("y", (d: any) => (orientation === 'vertical' ? d.y : d.x - d._height/2));

    g.selectAll<SVGForeignObjectElement, d3.HierarchyNode<SitemapNode>>(".node").each(function(d) {
        const isSelected = d.data.fullUrl === selectedUrl;
        const isMatch = searchTerm && (d.data.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.data.data.summary?.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const div = d3.select(this).select("div");
        div.html(renderNodeHtml(d, isSelected));
        
        d3.select(this).on("click", (e) => {
            e.stopPropagation();
            onSelectNode(d.data);
        });

        if (isMatch) d3.select(this).style("opacity", "1");
        else if (searchTerm) d3.select(this).style("opacity", "0.3");
        else d3.select(this).style("opacity", "1");
    });

    node.exit().remove();
  }, [data, dimensions, orientation, selectedUrl, searchTerm]);

  const renderNodeHtml = (d: d3.HierarchyNode<SitemapNode>, isSelected: boolean) => {
      const name = d.data.name.length > 28 ? d.data.name.substring(0, 25) + '...' : d.data.name;
      const summary = d.data.data.summary ? (d.data.data.summary.length > 65 ? d.data.data.summary.substring(0, 62) + '...' : d.data.data.summary) : 'No description';
      const isRoot = d.depth === 0;
      const sections = d.data.data.sections || [];
      const hasSections = sections.length > 0;
      
      let containerClass = "w-full h-full rounded-xl shadow-sm flex flex-col cursor-pointer transition-all duration-200 justify-between group-node bg-white overflow-hidden ";
      
      containerClass += isSelected 
        ? "border-2 border-blue-600 ring-4 ring-blue-100/50 " 
        : "border border-slate-200 hover:border-blue-400 hover:shadow-md ";

      const headerClass = isSelected ? "bg-blue-50/50" : "bg-slate-50/50";

      return `
        <div class="${containerClass}">
            <div class="${headerClass} px-4 py-3 border-b border-slate-100 shrink-0">
                <div class="flex items-center gap-2">
                    ${isRoot ? `<div class="p-1 rounded bg-blue-100 text-blue-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>` : ''}
                    <div class="font-bold text-slate-800 text-sm truncate" title="${d.data.name}">${name}</div>
                </div>
                <div class="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2" title="${d.data.data.summary || ''}">${summary}</div>
            </div>

            <div class="flex-1 p-3 min-h-0 flex flex-col">
                ${hasSections ? `
                <div class="w-full">
                    <div class="text-[10px] uppercase font-semibold text-slate-400 mb-1.5 flex items-center">
                        <svg width="10" height="10" class="mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>
                        Sections
                    </div>
                    <div class="space-y-1">
                    ${sections.map(s => `
                        <div class="flex items-center text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100 group-hover:border-slate-200 transition-colors">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-2 shrink-0"></span>
                            <span class="truncate">${s}</span>
                        </div>
                    `).join('')}
                    </div>
                </div>
                ` : `
                <div class="flex-1 flex items-center justify-center opacity-30 min-h-[40px]">
                    <svg width="32" height="32" class="text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                </div>
                `}
            </div>

            <div class="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0 mt-auto">
                <span class="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 bg-white rounded border border-slate-200">${d.data.data.changefreq || 'monthly'}</span>
                <span class="text-[10px] font-mono text-slate-400">P:${d.data.data.priority || '0.5'}</span>
            </div>
        </div>
      `;
  };

  const getStepPath = (link: d3.HierarchyLink<SitemapNode>, orient: Orientation, startFromSource = false) => {
    const s = link.source as any;
    const t = startFromSource ? link.source : link.target as any;
    
    // Coordinates are already adjusted in the data by our custom logic
    const sx = orient === 'vertical' ? s.x : s.y;
    const sy = orient === 'vertical' ? s.y : s.x;
    const tx = orient === 'vertical' ? t.x : t.y;
    const ty = orient === 'vertical' ? t.y : t.x;
    
    // For vertical: s.y is top of node. Connection point should be bottom of node.
    // t.y is top of target node.
    const sourceHeight = s._height || BASE_NODE_HEIGHT;
    const targetHeight = t._height || BASE_NODE_HEIGHT;

    if (orient === 'vertical') {
        const startY = sy + sourceHeight; // Bottom of source
        const endY = ty; // Top of target
        const midY = (startY + endY) / 2;
        return `M${sx},${startY} V${midY} H${tx} V${endY}`;
    } else {
        // Horizontal: sx is left. sy is center-y.
        // We want to exit from right of source.
        // Enter left of target.
        // Wait, for horizontal d.y was used for x-coord in the mapping logic above?
        // Let's verify transition logic: .attr("x", (d: any) => (orientation === 'vertical' ? d.x : d.y) - NODE_WIDTH / 2)
        // So `d.y` corresponds to SCREEN X (Depth).
        // `d.x` corresponds to SCREEN Y (Vertical position).
        
        // sx is SCREEN X. sy is SCREEN Y.
        // d.y was set by tree layout as depth.
        // But in horizontal `tree` logic, we used nodeSize([y, x]).
        // So d.x is vertical (breadth), d.y is depth.
        
        // s is the node object.
        // sx calculation: orient='horizontal' ? s.y : s.x -> s.y (depth)
        // sy calculation: orient='horizontal' ? s.x : s.y -> s.x (vertical)
        
        // We want to exit Right side of Source.
        // Node is drawn at (sx - WIDTH/2, sy - HEIGHT/2).
        // Right side is sx + WIDTH/2.
        
        const startX = sx + NODE_WIDTH/2;
        const endX = tx - NODE_WIDTH/2;
        const midX = (startX + endX) / 2;
        
        return `M${startX},${sy} H${midX} V${ty} H${endX}`;
    }
  };

  const handleZoom = (factor: number) => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy as any, factor);
    }
  };

  const handleFit = () => {
    if (svgRef.current && zoomRef.current && gRef.current) {
        const bounds = (gRef.current.node() as SVGGElement).getBBox();
        const fullWidth = wrapperRef.current?.clientWidth || 800;
        const fullHeight = wrapperRef.current?.clientHeight || 600;
        if (bounds.width === 0 || bounds.height === 0) return;
        
        // Add padding
        const padding = 40;
        const widthWithPadding = bounds.width + padding * 2;
        const heightWithPadding = bounds.height + padding * 2;
        
        const scale = 0.9 / Math.max(widthWithPadding / fullWidth, heightWithPadding / fullHeight);
        
        const translate = [
            fullWidth / 2 - (bounds.x + bounds.width / 2) * scale,
            fullHeight / 2 - (bounds.y + bounds.height / 2) * scale
        ];
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform as any,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
    }
  };

  // Export Logic
  const getCleanDataUrl = async (): Promise<string | null> => {
      if (!wrapperRef.current) return null;
      handleFit();
      await new Promise(r => setTimeout(r, 800));
      
      const filter = (node: HTMLElement) => {
          const classList = node.classList;
          return !classList?.contains('toolbar-ui');
      };

      try {
        return await toPng(wrapperRef.current, { 
            backgroundColor: '#f8fafc', 
            filter,
            pixelRatio: 3, 
            cacheBust: true,
        });
      } catch (e) {
        console.error("Export failed", e);
        return null;
      }
  };

  const handleExportPng = async () => {
    setIsExporting(true);
    const dataUrl = await getCleanDataUrl();
    if (dataUrl) {
        const link = document.createElement('a');
        link.download = 'sitemap-visual.png';
        link.href = dataUrl;
        link.click();
    }
    setIsExporting(false);
    setShowExportMenu(false);
  };

  const handleCopyClipboard = async () => {
    setIsExporting(true);
    if (wrapperRef.current) {
         try {
            handleFit();
            await new Promise(r => setTimeout(r, 800));

            const filter = (node: HTMLElement) => !node.classList?.contains('toolbar-ui');
            const blob = await toBlob(wrapperRef.current, { 
                backgroundColor: '#ffffff', 
                filter,
                pixelRatio: 3 
            });
            
            if(blob) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                setCopyStatus('success');
                setTimeout(() => setCopyStatus('idle'), 2000);
            }
         } catch(e) {
             console.error("Copy failed", e);
         }
    }
    setIsExporting(false);
    setShowExportMenu(false);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    const dataUrl = await getCleanDataUrl();
    if (dataUrl) {
        const pdf = new jsPDF({
            orientation: dimensions.width > dimensions.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [dimensions.width, dimensions.height]
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, dimensions.width, dimensions.height);
        pdf.save('sitemap.pdf');
    }
    setIsExporting(false);
    setShowExportMenu(false);
  };

  return (
    <div ref={wrapperRef} className="w-full h-full overflow-hidden relative border rounded-lg shadow-inner group"
         style={{
             backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)',
             backgroundColor: '#f8fafc',
             backgroundSize: '24px 24px'
         }}>
      {data.name === 'Empty' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none select-none">
          <Network size={48} className="mb-4 opacity-30" />
          <p className="text-sm font-medium">No pages yet</p>
          <p className="text-xs mt-1 opacity-70">Enter a domain above to crawl, or import a sitemap XML file</p>
        </div>
      )}
      <div className="toolbar-ui absolute top-4 left-4 z-10 flex flex-col space-y-2">
        <div className="bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-lg flex items-center p-1.5 focus-within:ring-2 focus-within:ring-blue-500 transition-all w-64">
            <Search size={16} className="text-slate-400 ml-1" />
            <input 
                type="text"
                placeholder="Find page or section..."
                className="bg-transparent border-none outline-none text-sm ml-2 w-full text-slate-700 placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>
      
      {/* Bottom Toolbar */}
      <div className="toolbar-ui absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex bg-white/90 backdrop-blur shadow-lg border border-slate-200 rounded-full px-4 py-2 space-x-4 items-center">
        <div className="flex space-x-1 border-r border-slate-200 pr-4">
            <button onClick={() => setOrientation('vertical')} className={`p-1.5 rounded-md transition-colors ${orientation === 'vertical' ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} title="Vertical Layout"><ArrowDown size={18} /></button>
            <button onClick={() => setOrientation('horizontal')} className={`p-1.5 rounded-md transition-colors ${orientation === 'horizontal' ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} title="Horizontal Layout"><ArrowRight size={18} /></button>
        </div>
        <div className="flex space-x-2 border-r border-slate-200 pr-4">
            <button onClick={() => handleZoom(1.2)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600" title="Zoom In"><ZoomIn size={18} /></button>
            <button onClick={() => handleFit()} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600" title="Fit to Screen"><Maximize size={18} /></button>
            <button onClick={() => handleZoom(0.8)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600" title="Zoom Out"><ZoomOut size={18} /></button>
        </div>
        
        {/* Export Menu */}
        <div className="relative">
            <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                className={`p-1.5 rounded-full transition-colors flex items-center space-x-2 ${showExportMenu ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 text-slate-600'}`}
                title="Export Visual"
            >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : copyStatus === 'success' ? <Check size={18} className="text-emerald-500"/> : <Share2 size={18} />}
            </button>
            
            {showExportMenu && (
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl border border-slate-200 w-48 py-1 overflow-hidden animate-in slide-in-from-bottom-2 fade-in">
                    <button onClick={handleExportPng} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-3">
                        <ImageIcon size={16} className="text-blue-500" />
                        <span>Download PNG</span>
                    </button>
                    <button onClick={handleExportPdf} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-3">
                        <FileText size={16} className="text-red-500" />
                        <span>Download PDF</span>
                    </button>
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button onClick={handleCopyClipboard} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-3">
                        <Clipboard size={16} className="text-emerald-500" />
                        <span>Copy Image</span>
                    </button>
                </div>
            )}
        </div>
      </div>
      <svg ref={svgRef} className="w-full h-full cursor-move touch-none"></svg>
    </div>
  );
};
export default VisualEditor;