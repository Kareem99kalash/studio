import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AnalysisResult } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

type AIResultsProps = {
  results: AnalysisResult[];
};

export function AIResults({ results }: AIResultsProps) {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Run an analysis to see AI-powered coverage suggestions.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {results.map(result => (
        <Card key={result.store.id}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: result.store.color }}></div>
              <CardTitle className="font-headline">{result.store.name} - Coverage Analysis</CardTitle>
            </div>
            <CardDescription>AI-generated summary of the best polygons for delivery.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Polygon ID</TableHead>
                    <TableHead>Polygon Name</TableHead>
                    <TableHead>Est. Delivery Time (min)</TableHead>
                    <TableHead>Distance to Store (km)</TableHead>
                    <TableHead>Coverage Score (/100)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.coverage.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row['Polygon ID']}</TableCell>
                      <TableCell>{row['Polygon Name']}</TableCell>
                      <TableCell>{row['Estimated Delivery Time (minutes)']}</TableCell>
                      <TableCell>{row['Distance to Store (km)']}</TableCell>
                      <TableCell>{row['Coverage Score (out of 100)']}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
