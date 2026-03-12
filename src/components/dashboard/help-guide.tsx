'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, FileSpreadsheet, Copy, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// 📝 CONFIGURATION: Add more guides here as needed
const GUIDES: any = {
  'city-upload': {
    title: "City Polygon Import",
    description: "Upload territory boundaries using WKT (Well-Known Text) format.",
    headers: ["City", "Zone_ID", "name", "WKT"],
    example: ["Erbil", "Z-101", "Downtown Sector A", "POLYGON((44.01 36.19, ...))"],
    tips: [
      "The 'WKT' column must contain valid POLYGON or MULTIPOLYGON strings.",
      "Zone_ID must be unique within the city.",
      "Save your file as .CSV (Comma Delimited) or .XLSX."
    ]
  },
  'store-upload': {
    title: "Hub/Store Batch Import",
    description: "Bulk upload logistics nodes for analysis.",
    headers: ["Name", "Lat", "Lng", "Category"],
    example: ["Erbil Main Hub", "36.1912", "44.0091", "Warehouse"],
    tips: [
      "Lat/Lng must be pure numbers (no degree symbols).",
      "Category is optional (defaults to 'Standard').",
      "Ensure no duplicate names exist in the same region."
    ]
  }
};

export function HelpGuide({ type }: { type: 'city-upload' | 'store-upload' }) {
  const { toast } = useToast();
  const data = GUIDES[type];

  if (!data) return null;

  const copyHeaders = () => {
    navigator.clipboard.writeText(data.headers.join(","));
    toast({ title: "Copied!", description: "Headers copied to clipboard." });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50">
          <HelpCircle className="h-4 w-4" />
          <span className="text-xs font-bold underline decoration-dotted underline-offset-4">Format Guide</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            {data.title}
          </DialogTitle>
          <DialogDescription>
            Expected file format and requirements.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="format" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="format">CSV Format</TabsTrigger>
            <TabsTrigger value="tips">Best Practices</TabsTrigger>
          </TabsList>
          
          {/* FORMAT TAB */}
          <TabsContent value="format" className="space-y-4 mt-4">
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border flex justify-between items-center">
                <span className="text-xs font-bold text-muted-foreground uppercase">Excel Columns</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={copyHeaders} title="Copy Headers">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-foreground font-bold">
                    <tr>
                      {data.headers.map((h: string) => (
                        <th key={h} className="px-3 py-2 border-r last:border-0 border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-card text-muted-foreground">
                    <tr>
                      {data.example.map((e: string, i: number) => (
                        <td key={i} className="px-3 py-2 border-r last:border-0 border-border font-mono">
                          {e.length > 15 ? e.substring(0, 15) + '...' : e}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic text-center">
              * The order of columns matters less than the exact header names.
            </p>
          </TabsContent>

          {/* TIPS TAB */}
          <TabsContent value="tips" className="mt-4">
            <div className="space-y-3">
              {data.tips.map((tip: string, idx: number) => (
                <div key={idx} className="flex gap-3 items-start bg-muted p-3 rounded-lg border border-border">
                  <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
