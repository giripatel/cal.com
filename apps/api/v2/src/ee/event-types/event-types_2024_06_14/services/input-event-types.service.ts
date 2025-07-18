import { ConnectedCalendarsData } from "@/ee/calendars/outputs/connected-calendars.output";
import { CalendarsService } from "@/ee/calendars/services/calendars.service";
import { EventTypesRepository_2024_06_14 } from "@/ee/event-types/event-types_2024_06_14/event-types.repository";
import { InputEventTransformed_2024_06_14 } from "@/ee/event-types/event-types_2024_06_14/transformed";
import {
  transformBookingFieldsApiToInternal,
  transformLocationsApiToInternal,
  transformIntervalLimitsApiToInternal,
  transformFutureBookingLimitsApiToInternal,
  transformRecurrenceApiToInternal,
  systemBeforeFieldName,
  systemBeforeFieldEmail,
  systemBeforeFieldLocation,
  systemAfterFieldTitle,
  systemAfterFieldNotes,
  systemAfterFieldGuests,
  systemAfterFieldRescheduleReason,
  transformBookerLayoutsApiToInternal,
  transformConfirmationPolicyApiToInternal,
  transformEventColorsApiToInternal,
  transformSeatsApiToInternal,
  SystemField,
  CustomField,
  InternalLocation,
  InternalLocationSchema,
} from "@/ee/event-types/event-types_2024_06_14/transformers";
import { UserWithProfile } from "@/modules/users/users.repository";
import { Injectable, BadRequestException } from "@nestjs/common";

import { getApps, getUsersCredentialsIncludeServiceAccountKey } from "@calcom/platform-libraries/app-store";
import { validateCustomEventName, EventTypeMetaDataSchema } from "@calcom/platform-libraries/event-types";
import {
  CreateEventTypeInput_2024_06_14,
  DestinationCalendar_2024_06_14,
  InputBookingField_2024_06_14,
  OutputUnknownLocation_2024_06_14,
  UpdateEventTypeInput_2024_06_14,
} from "@calcom/platform-types";
import { BookerLayouts } from "@calcom/prisma/zod-utils";

interface ValidationContext {
  eventTypeId?: number;
  seatsPerTimeSlot?: number | null;
  locations?: InputEventTransformed_2024_06_14["locations"];
  requiresConfirmation?: boolean;
  eventName?: string;
}

@Injectable()
export class InputEventTypesService_2024_06_14 {
  constructor(
    private readonly eventTypesRepository: EventTypesRepository_2024_06_14,
    private readonly calendarsService: CalendarsService
  ) {}

  async transformAndValidateCreateEventTypeInput(
    user: UserWithProfile,
    inputEventType: CreateEventTypeInput_2024_06_14
  ) {
    await this.validateInputLocations(user, inputEventType.locations);
    const transformedBody = this.transformInputCreateEventType(inputEventType);

    await this.validateEventTypeInputs({
      seatsPerTimeSlot: transformedBody?.seatsPerTimeSlot || null,
      locations: transformedBody.locations,
      requiresConfirmation: transformedBody.requiresConfirmation,
      eventName: transformedBody.eventName,
    });

    transformedBody.destinationCalendar &&
      (await this.validateInputDestinationCalendar(user.id, transformedBody.destinationCalendar));

    transformedBody.useEventTypeDestinationCalendarEmail &&
      (await this.validateInputUseDestinationCalendarEmail(user.id));

    return transformedBody;
  }

  async transformAndValidateUpdateEventTypeInput(
    inputEventType: UpdateEventTypeInput_2024_06_14,
    user: UserWithProfile,
    eventTypeId: number
  ) {
    await this.validateInputLocations(user, inputEventType.locations);

    const transformedBody = await this.transformInputUpdateEventType(inputEventType, eventTypeId);

    await this.validateEventTypeInputs({
      eventTypeId: eventTypeId,
      seatsPerTimeSlot: transformedBody.seatsPerTimeSlot,
      locations: transformedBody.locations,
      requiresConfirmation: transformedBody.requiresConfirmation,
      eventName: transformedBody.eventName,
    });

    transformedBody.destinationCalendar &&
      (await this.validateInputDestinationCalendar(user.id, transformedBody.destinationCalendar));

    transformedBody.useEventTypeDestinationCalendarEmail &&
      (await this.validateInputUseDestinationCalendarEmail(user.id));

    return transformedBody;
  }

  transformInputCreateEventType(inputEventType: CreateEventTypeInput_2024_06_14) {
    const {
      lengthInMinutes,
      lengthInMinutesOptions,
      locations,
      bookingFields,
      bookingLimitsCount,
      bookingLimitsDuration,
      bookingWindow,
      bookerLayouts,
      confirmationPolicy,
      color,
      recurrence,
      seats,
      customName,
      useDestinationCalendarEmail,
      disableGuests,
      ...rest
    } = inputEventType;
    const confirmationPolicyTransformed = this.transformInputConfirmationPolicy(confirmationPolicy);

    const locationsTransformed = locations?.length ? this.transformInputLocations(locations) : undefined;

    const effectiveBookingFields =
      disableGuests !== undefined
        ? this.getBookingFieldsWithGuestsToggled(bookingFields, disableGuests)
        : bookingFields;

    const eventType = {
      ...rest,
      length: lengthInMinutes,
      locations: locationsTransformed,
      bookingFields: this.transformInputBookingFields(effectiveBookingFields),
      bookingLimits: bookingLimitsCount ? this.transformInputIntervalLimits(bookingLimitsCount) : undefined,
      durationLimits: bookingLimitsDuration
        ? this.transformInputIntervalLimits(bookingLimitsDuration)
        : undefined,
      ...this.transformInputBookingWindow(bookingWindow),
      metadata: {
        bookerLayouts: this.transformInputBookerLayouts(bookerLayouts),
        requiresConfirmationThreshold:
          confirmationPolicyTransformed?.requiresConfirmationThreshold ?? undefined,
        multipleDuration: lengthInMinutesOptions,
      },
      requiresConfirmation: confirmationPolicyTransformed?.requiresConfirmation ?? undefined,
      requiresConfirmationWillBlockSlot:
        confirmationPolicyTransformed?.requiresConfirmationWillBlockSlot ?? undefined,
      eventTypeColor: this.transformInputEventTypeColor(color),
      recurringEvent: recurrence ? this.transformInputRecurrignEvent(recurrence) : undefined,
      ...this.transformInputSeatOptions(seats),
      eventName: customName,
      useEventTypeDestinationCalendarEmail: useDestinationCalendarEmail,
    };

    return eventType;
  }

  async transformInputUpdateEventType(inputEventType: UpdateEventTypeInput_2024_06_14, eventTypeId: number) {
    const {
      lengthInMinutes,
      lengthInMinutesOptions,
      locations,
      bookingFields,
      bookingLimitsCount,
      bookingLimitsDuration,
      bookingWindow,
      bookerLayouts,
      confirmationPolicy,
      color,
      recurrence,
      seats,
      customName,
      useDestinationCalendarEmail,
      disableGuests,
      ...rest
    } = inputEventType;
    const eventTypeDb = await this.eventTypesRepository.getEventTypeWithMetaData(eventTypeId);
    const metadataTransformed = !!eventTypeDb?.metadata
      ? EventTypeMetaDataSchema.parse(eventTypeDb.metadata)
      : {};

    const confirmationPolicyTransformed = this.transformInputConfirmationPolicy(confirmationPolicy);

    const effectiveBookingFields =
      disableGuests !== undefined
        ? this.getBookingFieldsWithGuestsToggled(bookingFields, disableGuests)
        : bookingFields;

    const eventType = {
      ...rest,
      length: lengthInMinutes,
      locations: locations ? this.transformInputLocations(locations) : undefined,
      bookingFields: effectiveBookingFields
        ? this.transformInputBookingFields(effectiveBookingFields)
        : undefined,
      bookingLimits: bookingLimitsCount ? this.transformInputIntervalLimits(bookingLimitsCount) : undefined,
      durationLimits: bookingLimitsDuration
        ? this.transformInputIntervalLimits(bookingLimitsDuration)
        : undefined,
      ...this.transformInputBookingWindow(bookingWindow),
      metadata: {
        ...metadataTransformed,
        bookerLayouts: this.transformInputBookerLayouts(bookerLayouts),
        requiresConfirmationThreshold:
          confirmationPolicyTransformed?.requiresConfirmationThreshold ?? undefined,
        multipleDuration: lengthInMinutesOptions,
      },
      recurringEvent: recurrence ? this.transformInputRecurrignEvent(recurrence) : undefined,
      requiresConfirmation: confirmationPolicyTransformed?.requiresConfirmation ?? undefined,
      requiresConfirmationWillBlockSlot:
        confirmationPolicyTransformed?.requiresConfirmationWillBlockSlot ?? undefined,
      eventTypeColor: this.transformInputEventTypeColor(color),
      ...this.transformInputSeatOptions(seats),
      eventName: customName,
      useEventTypeDestinationCalendarEmail: useDestinationCalendarEmail,
    };

    return eventType;
  }

  getBookingFieldsWithGuestsToggled(
    bookingFields: InputBookingField_2024_06_14[] | undefined,
    hideGuests: boolean
  ) {
    const toggledGuestsBookingField: InputBookingField_2024_06_14 = { slug: "guests", hidden: hideGuests };
    if (!bookingFields) {
      return [toggledGuestsBookingField];
    }

    const bookingFieldsCopy = [...bookingFields];

    const guestsBookingField = bookingFieldsCopy.find((field) => "slug" in field && field.slug === "guests");
    if (guestsBookingField) {
      Object.assign(guestsBookingField, { hidden: hideGuests });
      return bookingFieldsCopy;
    }

    bookingFieldsCopy.push(toggledGuestsBookingField);
    return bookingFieldsCopy;
  }

  transformInputLocations(inputLocations: CreateEventTypeInput_2024_06_14["locations"]) {
    return transformLocationsApiToInternal(inputLocations);
  }

  transformInputBookingFields(inputBookingFields: CreateEventTypeInput_2024_06_14["bookingFields"]) {
    const internalFields: (SystemField | CustomField)[] = inputBookingFields
      ? transformBookingFieldsApiToInternal(inputBookingFields)
      : [];
    const systemCustomFields = internalFields.filter((field) => !this.isUserCustomField(field));
    const userCustomFields = internalFields.filter((field) => this.isUserCustomField(field));

    const systemCustomNameField = systemCustomFields?.find((field) => field.type === "name");
    const systemCustomEmailField = systemCustomFields?.find((field) => field.type === "email");
    const systemCustomTitleField = systemCustomFields?.find((field) => field.name === "title");
    const systemCustomLocationField = systemCustomFields?.find((field) => field.name === "location");
    const systemCustomNotesField = systemCustomFields?.find((field) => field.name === "notes");
    const systemCustomGuestsField = systemCustomFields?.find((field) => field.name === "guests");
    const systemCustomRescheduleReasonField = systemCustomFields?.find(
      (field) => field.name === "rescheduleReason"
    );

    const defaultFieldsBefore: (SystemField | CustomField)[] = [
      systemCustomNameField || systemBeforeFieldName,
      systemCustomEmailField || systemBeforeFieldEmail,
      systemCustomLocationField || systemBeforeFieldLocation,
    ];

    const defaultFieldsAfter = [
      systemCustomTitleField || systemAfterFieldTitle,
      systemCustomNotesField || systemAfterFieldNotes,
      systemCustomGuestsField || systemAfterFieldGuests,
      systemCustomRescheduleReasonField || systemAfterFieldRescheduleReason,
    ];

    const bookingFields = [...defaultFieldsBefore, ...userCustomFields, ...defaultFieldsAfter];

    if (!this.hasEmailOrPhoneOnlySetup(bookingFields)) {
      throw new BadRequestException(
        "Booking fields validation failed: visible and required email or visible and required attendee phone field is needed."
      );
    }

    return bookingFields;
  }

  hasEmailOrPhoneOnlySetup(bookingFields: (SystemField | CustomField)[]) {
    const emailField = bookingFields.find((field) => field.type === "email" && field.name === "email");
    const attendeePhoneNumberField = bookingFields.find(
      (field) => field.type === "phone" && field.name === "attendeePhoneNumber"
    );

    const isEmailFieldRequiredAndVisible = emailField?.required && !emailField?.hidden;
    const isAttendeePhoneNumberFieldRequiredAndVisible =
      attendeePhoneNumberField?.required && !attendeePhoneNumberField?.hidden;

    return isEmailFieldRequiredAndVisible || isAttendeePhoneNumberFieldRequiredAndVisible;
  }

  isUserCustomField(field: SystemField | CustomField): field is CustomField {
    return (
      field.type !== "name" &&
      field.type !== "email" &&
      field.name !== "title" &&
      field.name !== "notes" &&
      field.name !== "guests" &&
      field.name !== "rescheduleReason" &&
      field.name !== "location"
    );
  }

  transformInputIntervalLimits(inputBookingFields: CreateEventTypeInput_2024_06_14["bookingLimitsCount"]) {
    return transformIntervalLimitsApiToInternal(inputBookingFields);
  }

  transformInputBookingWindow(inputBookingWindow: CreateEventTypeInput_2024_06_14["bookingWindow"]) {
    const res = transformFutureBookingLimitsApiToInternal(inputBookingWindow);
    return !!res ? res : {};
  }

  transformInputBookerLayouts(inputBookerLayouts: CreateEventTypeInput_2024_06_14["bookerLayouts"]) {
    const layouts = transformBookerLayoutsApiToInternal(inputBookerLayouts);
    if (!layouts) return undefined;
    return {
      defaultLayout: layouts.defaultLayout as unknown as BookerLayouts,
      enabledLayouts: layouts.enabledLayouts as unknown as BookerLayouts[],
    };
  }

  transformInputConfirmationPolicy(
    requiresConfirmation: CreateEventTypeInput_2024_06_14["confirmationPolicy"]
  ) {
    return transformConfirmationPolicyApiToInternal(requiresConfirmation);
  }
  transformInputRecurrignEvent(recurrence: CreateEventTypeInput_2024_06_14["recurrence"]) {
    if (!recurrence || recurrence.disabled) {
      return undefined;
    }

    return transformRecurrenceApiToInternal(recurrence);
  }

  transformInputEventTypeColor(color: CreateEventTypeInput_2024_06_14["color"]) {
    return transformEventColorsApiToInternal(color);
  }

  transformInputSeatOptions(seats: CreateEventTypeInput_2024_06_14["seats"]) {
    return transformSeatsApiToInternal(seats);
  }
  async validateEventTypeInputs({
    eventTypeId,
    seatsPerTimeSlot,
    locations,
    requiresConfirmation,
    eventName,
  }: ValidationContext) {
    let seatsPerTimeSlotDb: number | null = null;
    let locationsDb: ReturnType<typeof this.transformLocations> = [];
    let requiresConfirmationDb = false;

    if (eventTypeId != null) {
      const eventTypeDb = await this.eventTypesRepository.getEventTypeWithSeats(eventTypeId);
      seatsPerTimeSlotDb = eventTypeDb?.seatsPerTimeSlot ?? null;
      locationsDb = this.transformLocations(eventTypeDb?.locations) ?? [];
      requiresConfirmationDb = eventTypeDb?.requiresConfirmation ?? false;
    }

    const seatsPerTimeSlotFinal = !!seatsPerTimeSlot ? seatsPerTimeSlot : seatsPerTimeSlotDb;
    const seatsEnabledFinal = !!seatsPerTimeSlotFinal && seatsPerTimeSlotFinal > 0;

    const locationsFinal = locations !== undefined ? locations : locationsDb;
    const requiresConfirmationFinal =
      requiresConfirmation !== undefined ? requiresConfirmation : requiresConfirmationDb;
    this.validateSeatsSingleLocationRule(seatsEnabledFinal, locationsFinal);
    this.validateSeatsRequiresConfirmationFalseRule(seatsEnabledFinal, requiresConfirmationFinal);
    this.validateMultipleLocationsSeatsDisabledRule(locationsFinal, seatsEnabledFinal);
    this.validateRequiresConfirmationSeatsDisabledRule(requiresConfirmationFinal, seatsEnabledFinal);

    if (eventName) {
      await this.validateCustomEventNameInput(eventName);
    }
  }
  validateSeatsSingleLocationRule(
    seatsEnabled: boolean,
    locations: ReturnType<typeof this.transformLocations>
  ) {
    if (seatsEnabled && locations.length > 1) {
      throw new BadRequestException(
        "Seats Validation failed: Seats are enabled but more than one location provided."
      );
    }
  }
  transformLocations(locations: any) {
    if (!locations) return [];

    const knownLocations: InternalLocation[] = [];
    const unknownLocations: OutputUnknownLocation_2024_06_14[] = [];

    for (const location of locations) {
      const result = InternalLocationSchema.safeParse(location);
      if (result.success) {
        knownLocations.push(result.data);
      } else {
        unknownLocations.push({ type: "unknown", location: JSON.stringify(location) });
      }
    }
    return [...knownLocations];
  }

  validateSeatsRequiresConfirmationFalseRule(seatsEnabled: boolean, requiresConfirmation: boolean) {
    if (seatsEnabled && requiresConfirmation) {
      throw new BadRequestException(
        "Seats Validation failed: Seats are enabled but requiresConfirmation is true."
      );
    }
  }

  validateMultipleLocationsSeatsDisabledRule(
    locations: ReturnType<typeof this.transformLocations>,
    seatsEnabled: boolean
  ) {
    if (locations.length > 1 && seatsEnabled) {
      throw new BadRequestException("Locations Validation failed: Multiple locations but seats are enabled.");
    }
  }

  validateRequiresConfirmationSeatsDisabledRule(requiresConfirmation: boolean, seatsEnabled: boolean) {
    if (requiresConfirmation && seatsEnabled) {
      throw new BadRequestException(
        "RequiresConfirmation Validation failed: Seats are enabled but requiresConfirmation is true."
      );
    }
  }

  async validateCustomEventNameInput(value: string) {
    const validationResult = validateCustomEventName(value);
    if (validationResult !== true) {
      throw new BadRequestException(`Invalid event name variables: ${validationResult}`);
    }
    return;
  }

  async validateInputDestinationCalendar(
    userId: number,
    destinationCalendar: DestinationCalendar_2024_06_14
  ) {
    const calendars: ConnectedCalendarsData = await this.calendarsService.getCalendars(userId);

    const allCals = calendars.connectedCalendars.map((cal) => cal.calendars ?? []).flat();

    const matchedCalendar = allCals.find(
      (cal) =>
        cal.externalId === destinationCalendar.externalId &&
        cal.integration === destinationCalendar.integration
    );

    if (!matchedCalendar) {
      throw new BadRequestException("Invalid destinationCalendarId: Calendar does not exist");
    }

    if (matchedCalendar.readOnly) {
      throw new BadRequestException("Invalid destinationCalendarId: Calendar does not have write permission");
    }

    return;
  }

  async validateInputUseDestinationCalendarEmail(userId: number) {
    const calendars: ConnectedCalendarsData = await this.calendarsService.getCalendars(userId);

    const allCals = calendars.connectedCalendars.map((cal) => cal.calendars ?? []).flat();

    const primaryCalendar = allCals.find((cal) => cal.primary);

    if (!primaryCalendar) {
      throw new BadRequestException(
        "Validation failed: A primary connected calendar is required to set useDestinationCalendarEmail"
      );
    }

    return;
  }

  async validateInputLocations(
    user: UserWithProfile,
    inputLocations: CreateEventTypeInput_2024_06_14["locations"] | undefined
  ) {
    await Promise.all(
      inputLocations?.map(async (location) => {
        if (location.type === "integration") {
          // cal-video is global, so we can skip this check
          if (location.integration !== "cal-video") {
            await this.checkAppIsValidAndConnected(user, location.integration);
          }
        }
      }) ?? []
    );
  }

  async checkAppIsValidAndConnected(user: UserWithProfile, appSlug: string) {
    const conferencingApps = ["google-meet", "office365-video", "zoom"];
    if (!conferencingApps.includes(appSlug)) {
      throw new BadRequestException("Invalid app, available apps are: ", conferencingApps.join(", "));
    }

    if (appSlug === "office365-video") {
      appSlug = "msteams";
    }

    const credentials = await getUsersCredentialsIncludeServiceAccountKey(user);

    const foundApp = getApps(credentials, true).filter((app) => app.slug === appSlug)[0];

    const appLocation = foundApp?.appData?.location;

    if (!foundApp || !appLocation) {
      throw new BadRequestException(`${appSlug} not connected.`);
    }
    return foundApp.credential;
  }
}
