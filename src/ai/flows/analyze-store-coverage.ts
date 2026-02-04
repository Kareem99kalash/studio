'use server';

/**
 * @fileOverview An AI agent that analyzes store coverage and provides a summary of the best polygons for delivery.
 *
 * - analyzeStoreCoverage - A function that handles the store coverage analysis process.
 * - AnalyzeStoreCoverageInput - The input type for the analyzeStoreCoverage function.
 * - AnalyzeStoreCoverageOutput - The return type for the analyzeStoreCoverage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeStoreCoverageInputSchema = z.object({
  storeLocationCoordinates: z
    .string()
    .describe(
      'The coordinates of the store location in the format "latitude,longitude".'
    ),
  city: z.string().describe('The city in which to analyze store coverage.'),
  polygonData: z.string().describe('GeoJSON string representing the polygons for the selected city'),
});
export type AnalyzeStoreCoverageInput = z.infer<typeof AnalyzeStoreCoverageInputSchema>;

const AnalyzeStoreCoverageOutputSchema = z.object({
  coverageSummary: z
    .string()
    .describe(
      'A summary of the best polygons for delivery, presented in a table format.'
    ),
});
export type AnalyzeStoreCoverageOutput = z.infer<typeof AnalyzeStoreCoverageOutputSchema>;

export async function analyzeStoreCoverage(
  input: AnalyzeStoreCoverageInput
): Promise<AnalyzeStoreCoverageOutput> {
  return analyzeStoreCoverageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeStoreCoveragePrompt',
  input: {schema: AnalyzeStoreCoverageInputSchema},
  output: {schema: AnalyzeStoreCoverageOutputSchema},
  prompt: `You are an AI assistant specializing in analyzing store coverage areas.

  Given a store location and a set of polygons for a specific city, you will analyze the potential coverage area and provide a summary of the best polygons for delivery. This summary should be presented in a table format.

  The table should include the following columns:
    - Polygon ID
    - Polygon Name
    - Estimated Delivery Time (minutes)
    - Distance to Store (km)
    - Coverage Score (out of 100)

  Consider factors such as distance, estimated delivery time, and potential customer density when calculating the coverage score. Prioritize polygons that are closer to the store, have shorter delivery times, and cover areas with higher customer density.

  Store Location Coordinates: {{{storeLocationCoordinates}}}
  City: {{{city}}}
  Polygons: {{{polygonData}}}

  Please provide the coverage summary in a markdown table format.
`,
});

const analyzeStoreCoverageFlow = ai.defineFlow(
  {
    name: 'analyzeStoreCoverageFlow',
    inputSchema: AnalyzeStoreCoverageInputSchema,
    outputSchema: AnalyzeStoreCoverageOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
