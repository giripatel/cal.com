import { format } from "date-fns";
import type { Dayjs } from "dayjs";
import { useState, useEffect, useCallback } from "react";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { Button, buttonClasses } from "@calcom/ui/components/button";
import {
  Command,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandSeparator,
} from "@calcom/ui/components/command";
import { DateRangePicker } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@calcom/ui/components/popover";

import { useDataTable, useFilterValue } from "../../hooks";
import {
  CUSTOM_PRESET,
  CUSTOM_PRESET_VALUE,
  DEFAULT_PRESET,
  PRESET_OPTIONS,
  getDefaultStartDate,
  getDefaultEndDate,
  getDateRangeFromPreset,
  type PresetOption,
} from "../../lib/dateRange";
import type { FilterableColumn, DateRangeFilterOptions } from "../../lib/types";
import { ZDateRangeFilterValue, ColumnFilterType } from "../../lib/types";
import { useFilterPopoverOpen } from "./useFilterPopoverOpen";

type DateRangeFilterProps = {
  column: Extract<FilterableColumn, { type: ColumnFilterType.DATE_RANGE }>;
  options?: DateRangeFilterOptions;
  showColumnName?: boolean;
  showClearButton?: boolean;
};

export const DateRangeFilter = ({
  column,
  options,
  showColumnName = false,
  showClearButton = false,
}: DateRangeFilterProps) => {
  const { open, onOpenChange } = useFilterPopoverOpen(column.id);
  const filterValue = useFilterValue(column.id, ZDateRangeFilterValue);
  const { updateFilter, removeFilter } = useDataTable();
  const range = options?.range ?? "past";
  const endOfDay = options?.endOfDay ?? false;
  const forceCustom = range === "custom";
  const forcePast = range === "past";

  const { t } = useLocale();
  const currentDate = dayjs();
  const [startDate, setStartDate] = useState<Dayjs | undefined>(
    filterValue?.data.startDate ? dayjs(filterValue.data.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Dayjs | undefined>(
    filterValue?.data.endDate ? dayjs(filterValue.data.endDate) : undefined
  );
  const [selectedPreset, setSelectedPreset] = useState<PresetOption>(
    forceCustom
      ? CUSTOM_PRESET
      : filterValue?.data.preset
      ? PRESET_OPTIONS.find((o) => o.value === filterValue.data.preset) ?? DEFAULT_PRESET
      : DEFAULT_PRESET
  );

  const updateValues = useCallback(
    ({ preset, startDate, endDate }: { preset: PresetOption; startDate?: Dayjs; endDate?: Dayjs }) => {
      setSelectedPreset(preset);
      setStartDate(startDate);
      setEndDate(endDate);

      if (startDate && endDate) {
        updateFilter(column.id, {
          type: ColumnFilterType.DATE_RANGE,
          data: {
            startDate: startDate.toDate().toISOString(),
            endDate: (endOfDay ? endDate.endOf("day") : endDate).toDate().toISOString(),
            preset: preset.value,
          },
        });
      }
    },
    [column.id, endOfDay]
  );

  useEffect(() => {
    // initially apply the default value
    // if the query param is not set yet
    if (!filterValue && !forceCustom) {
      updateValues({
        preset: DEFAULT_PRESET,
        startDate: getDefaultStartDate(),
        endDate: getDefaultEndDate(),
      });
    }
  }, [filterValue, forceCustom, updateValues]);

  const updateDateRangeFromPreset = (val: string | null) => {
    if (val === CUSTOM_PRESET_VALUE) {
      updateValues({
        preset: CUSTOM_PRESET,
        startDate,
        endDate,
      });
    } else {
      const { preset, startDate, endDate } = getDateRangeFromPreset(val);
      updateValues({
        preset,
        startDate,
        endDate,
      });
    }
  };

  const updateDateRangeFromPicker = ({
    startDate,
    endDate,
  }: {
    startDate?: Date | undefined;
    endDate?: Date | undefined;
  }) => {
    updateValues({
      preset: CUSTOM_PRESET,
      startDate: startDate ? dayjs(startDate) : getDefaultStartDate(),
      endDate: endDate ? dayjs(endDate) : undefined,
    });
  };

  const isCustomPreset = selectedPreset.value === CUSTOM_PRESET_VALUE;

  let customButtonLabel = t("date_range");
  if (startDate && endDate) {
    customButtonLabel = `${format(startDate.toDate(), "LLL dd, y")} - ${format(
      endDate.toDate(),
      "LLL dd, y"
    )}`;
  } else if (startDate) {
    customButtonLabel = `${format(startDate.toDate(), "LLL dd, y")} - ?`;
  }

  const selectedValue = isCustomPreset
    ? customButtonLabel
    : t(selectedPreset.labelKey, selectedPreset.i18nOptions);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          color="secondary"
          className="items-center capitalize"
          StartIcon="calendar-range"
          EndIcon="chevron-down"
          data-testid={`filter-popover-trigger-${column.id}`}>
          {showColumnName && (
            <>
              <span>{column.title}</span>
              <Badge variant="gray" className="ml-2">
                {selectedValue}
              </Badge>
            </>
          )}
          {!showColumnName && <span>{selectedValue}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-fit p-0" align="end">
        {isCustomPreset && (
          <div className="border-subtle border-r">
            <DateRangePicker
              dates={{
                startDate: startDate?.toDate(),
                endDate: endDate?.toDate(),
              }}
              data-testid="date-range-calendar"
              minDate={forcePast ? currentDate.subtract(2, "year").toDate() : null}
              maxDate={forcePast ? currentDate.toDate() : undefined}
              disabled={false}
              onDatesChange={updateDateRangeFromPicker}
              withoutPopover={true}
            />
            {forceCustom && (
              <div className="border-subtle border-t px-2 py-3">
                <Button
                  color="secondary"
                  className="w-full justify-center"
                  onClick={() => removeFilter(column.id)}>
                  {t("clear")}
                </Button>
              </div>
            )}
          </div>
        )}
        {!forceCustom && (
          <Command className={classNames("w-40", isCustomPreset && "rounded-b-none")}>
            <CommandList>
              {PRESET_OPTIONS.map((option) => (
                <CommandItem
                  key={option.value}
                  data-testid={`date-range-options-${option.value}`}
                  className={classNames(
                    "cursor-pointer justify-between px-3 py-2",
                    selectedPreset.value === option.value && "bg-emphasis"
                  )}
                  onSelect={() => {
                    updateDateRangeFromPreset(option.value);
                  }}>
                  <span className="capitalize">{t(option.labelKey, option.i18nOptions)}</span>
                  {selectedPreset.value === option.value && <Icon name="check" />}
                </CommandItem>
              ))}
            </CommandList>
            {showClearButton && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      removeFilter(column.id);
                    }}
                    className={classNames(
                      "w-full justify-center text-center",
                      buttonClasses({ color: "secondary" })
                    )}>
                    {t("clear")}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
};
