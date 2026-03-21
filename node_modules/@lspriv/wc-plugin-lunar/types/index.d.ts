import { type Plugin, type WcYear, type CalendarDay, type TrackDateResult, type TrackYearResult, type PluginService } from '@lspriv/wx-calendar/lib';
import { Lunar } from './lunar';
export interface LunarOptions {
    markColor?: string;
    nyColor?: string;
    fdColor?: string;
}
export declare class LunarPlugin implements Plugin {
    static KEY: "lunar";
    private options;
    private style;
    private hasDefFdColor;
    private service;
    PRINTER_ALWAYS_DATE_MARK: boolean;
    constructor(options?: LunarOptions);
    PLUGIN_ON_INITIALIZE(service: PluginService): void;
    private getFdColor;
    getLunar(date: CalendarDay): ReturnType<(typeof Lunar)['lunar']>;
    PLUGIN_TRACK_DATE(date: CalendarDay): TrackDateResult;
    PLUGIN_TRACK_YEAR(year: WcYear): TrackYearResult;
}
export declare const LUNAR_PLUGIN_KEY: "lunar";
