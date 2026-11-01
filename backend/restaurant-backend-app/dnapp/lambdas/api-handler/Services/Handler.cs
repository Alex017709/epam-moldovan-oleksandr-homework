using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Entities;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Helpers; // <--- Додано для розпізнавання ResponseBuilder
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace Function.Services;

public class GroupOrderHandler
{
    private readonly IGuestSessionRepository _sessionRepository;

    public GroupOrderHandler(IGuestSessionRepository sessionRepository)
    {
        _sessionRepository = sessionRepository;
    }

    // ==========================================
    // РІВЕНЬ 1: Отримання списку сесій учасників
    // GET /guest/groups/{groupReservationId}/sessions
    // ==========================================
    public async Task<APIGatewayProxyResponse> GetGroupSessionsAsync(APIGatewayProxyRequest request, ILambdaContext context)
    {
        try
        {
            if (request.PathParameters == null || !request.PathParameters.TryGetValue("groupReservationId", out var groupReservationId) || string.IsNullOrEmpty(groupReservationId))
            {
                return ResponseBuilder.CreateErrorResponse(400, "Missing groupReservationId", context.Logger);
            }

            var sessions = await _sessionRepository.GetAllByGroupReservationIdAsync(groupReservationId);

            var participants = sessions.Select(s => new
            {
                id = s.Id,
                type = s.IsOwnerSession ? "Owner" : "Guest",
                name = s.GuestName,
                items = s.Dishes,
                total = 0m, // Оскільки OrderItem не має прямого поля Price, поки ставимо 0 або витягуємо ціну за потреби
                isSubmitted = s.IsSubmitted
            }).ToList();

            var grandTotal = participants.Sum(p => p.total);

            var responseBody = new
            {
                participants = participants,
                total = grandTotal
            };

            return ResponseBuilder.CreateSuccessResponse(JsonSerializer.Serialize(responseBody), 200);
        }
        catch (Exception ex)
        {
            return ExceptionHandler.Handle(ex, context);
        }
    }

    // ==========================================
    // РІВЕНЬ 2 (Частина 1): Отримати owner session id
    // GET /reservations/{reservationId}/guest-session-id
    // ==========================================
    public async Task<APIGatewayProxyResponse> GetOwnerSessionIdAsync(APIGatewayProxyRequest request, ILambdaContext context)
    {
        try
        {
            if (request.PathParameters == null || !request.PathParameters.TryGetValue("reservationId", out var reservationId) || string.IsNullOrEmpty(reservationId))
            {
                return ResponseBuilder.CreateErrorResponse(400, "Missing reservationId", context.Logger);
            }

            var sessions = await _sessionRepository.GetAllByGroupReservationIdAsync(reservationId);
            var ownerSession = sessions.FirstOrDefault(s => s.IsOwnerSession);

            if (ownerSession == null)
            {
                return ResponseBuilder.CreateErrorResponse(404, "Owner session not found", context.Logger);
            }

            var responseBody = new { guestSessionId = ownerSession.Id };
            return ResponseBuilder.CreateSuccessResponse(JsonSerializer.Serialize(responseBody), 200);
        }
        catch (Exception ex)
        {
            return ExceptionHandler.Handle(ex, context);
        }
    }

    // ==========================================
    // РІВЕНЬ 2 (Частина 2): Підтвердити консолідований pre-order
    // POST /group-reservations/{groupReservationId}/submit
    // ==========================================
    public async Task<APIGatewayProxyResponse> SubmitGroupPreOrderAsync(APIGatewayProxyRequest request, ILambdaContext context)
    {
        try
        {
            if (request.PathParameters == null || !request.PathParameters.TryGetValue("groupReservationId", out var groupReservationId) || string.IsNullOrEmpty(groupReservationId))
            {
                return ResponseBuilder.CreateErrorResponse(400, "Missing groupReservationId", context.Logger);
            }

            var sessions = await _sessionRepository.GetAllByGroupReservationIdAsync(groupReservationId);
            if (sessions == null || !sessions.Any())
            {
                return ResponseBuilder.CreateErrorResponse(404, "Group reservation not found", context.Logger);
            }

            var submittedSessions = sessions.Where(s => s.IsSubmitted).ToList();
            if (!submittedSessions.Any())
            {
                return ResponseBuilder.CreateErrorResponse(400, "No submitted sessions found", context.Logger);
            }

            var allItems = submittedSessions.SelectMany(s => s.Dishes).ToList();
            if (!allItems.Any())
            {
                return ResponseBuilder.CreateErrorResponse(400, "No dishes found in submitted sessions", context.Logger);
            }

            var consolidatedDishes = allItems
                .GroupBy(i => i.DishId)
                .Select(g => new
                {
                    dishId = g.Key,
                    quantity = g.Sum(i => i.Quantity)
                })
                .ToList();

            return ResponseBuilder.CreateSuccessResponse(JsonSerializer.Serialize(consolidatedDishes), 200);
        }
        catch (Exception ex)
        {
            return ExceptionHandler.Handle(ex, context);
        }
    }

    // ==========================================
    // РІВЕНЬ 3: Видалення guest session із групи
    // DELETE /guest/groups/{groupReservationId}/sessions/{guestSessionId}
    // ==========================================
    public async Task<APIGatewayProxyResponse> DeleteGuestSessionAsync(APIGatewayProxyRequest request, ILambdaContext context)
    {
        try
        {
            if (request.PathParameters == null || 
                !request.PathParameters.TryGetValue("groupReservationId", out var groupReservationId) ||
                !request.PathParameters.TryGetValue("guestSessionId", out var guestSessionId))
            {
                return ResponseBuilder.CreateErrorResponse(400, "Missing path parameters", context.Logger);
            }

            var sessionToDelete = await _sessionRepository.GetByGuestSessionId(guestSessionId);
            if (sessionToDelete == null)
            {
                return ResponseBuilder.CreateErrorResponse(404, "Guest session not found", context.Logger);
            }

            if (sessionToDelete.GroupReservationId != groupReservationId)
            {
                return ResponseBuilder.CreateErrorResponse(400, "Guest session does not belong to this group reservation", context.Logger);
            }

            await _sessionRepository.DeleteAsync(sessionToDelete);

            var remainingSessions = await _sessionRepository.GetAllByGroupReservationIdAsync(groupReservationId);

            var participants = remainingSessions.Select(s => new
            {
                id = s.Id,
                type = s.IsOwnerSession ? "Owner" : "Guest",
                name = s.GuestName,
                items = s.Dishes,
                total = 0m,
                isSubmitted = s.IsSubmitted
            }).ToList();

            var grandTotal = participants.Sum(p => p.total);

            var responseBody = new
            {
                participants = participants,
                total = grandTotal
            };

            return ResponseBuilder.CreateSuccessResponse(JsonSerializer.Serialize(responseBody), 200);
        }
        catch (Exception ex)
        {
            return ExceptionHandler.Handle(ex, context);
        }
    }
}