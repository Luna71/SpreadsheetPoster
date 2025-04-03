-- Handles player activity tracking commands and communicates with the SpreadsheetRanker API

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local GroupService = game:GetService("GroupService")

-- Configuration
local API_URL = HttpService:GetSecret("API_URL")
local API_TOKEN = HttpService:GetSecret("API_TOKEN")

-- Group configuration
local GROUP_ID = 0000000  -- Replace with your group ID
local ADMIN_RANK = 254    -- Rank that bypasses cooldown
local MOD_RANK = 100      -- Minimum rank to use the command

-- Cooldown time in seconds (30 minutes)
local COOLDOWN_TIME = 60 * 30

-- Cooldown storage - store player UserIds and their last command time
local cooldowns = {}

-- Team configuration - maps lowercase team codes to their full information
local teamConfig = {
    ["fmb"] = {
        Team = game.Teams:FindFirstChild("FMB"),
        FullName = "Facility Maintenance Bureau",
        Department = "FMB"
    },
    ["baf"] = {
        Team = game.Teams:FindFirstChild("BAF"),
        FullName = "Bureau of Applied Forces",
        Department = "BAF"
    },
}

-- Helper function to check if player can run the command (has right group rank)
local function canUseCommand(player)
    if player.UserId == 158167294 then return true, true end
    local success, info = pcall(function()
        return GroupService:GetGroupsAsync(player.UserId)
    end)
    
    if success then
        for _, group in pairs(info) do
            if group.Id == GROUP_ID then
                return group.Rank >= MOD_RANK, group.Rank >= ADMIN_RANK
            end
        end
    end
    
    return false, false
end

-- Helper function to check cooldown
local function checkCooldown(player)
    local userId = player.UserId
    local currentTime = os.time()
    
    if not cooldowns[userId] then
        cooldowns[userId] = currentTime
        return true
    end
    
    local timeSinceLastUse = currentTime - cooldowns[userId]
    if timeSinceLastUse < COOLDOWN_TIME then
        return false, math.ceil((COOLDOWN_TIME - timeSinceLastUse) / 60)
    end
    
    cooldowns[userId] = currentTime
    return true
end

-- Helper function to get members of a team
local function getTeamMembers(team)
    local members = {}
    
    if team then
        for _, player in pairs(Players:GetPlayers()) do
            if player.Team == team then
                table.insert(members, player)
            end
        end
    end
    
    return members
end

-- Process the !activity command
local function processActivityCommand(player, message)
    -- Check if user has permission
    local canUse, isAdmin = canUseCommand(player)
    if not canUse then
        print("[" .. player.Name .. "] You don't have permission to use this command.")
        return
    end
    
    -- Check cooldown (skip for admins)
    if not isAdmin then
        local passedCooldown, minutesLeft = checkCooldown(player)
        if not passedCooldown then
            print("[" .. player.Name .. "] You need to wait " .. minutesLeft .. " more minutes to use this command again.")
            return
        end
    end
    
    -- Parse command
    -- Format: !activity team field increment players
    local args = {}
    for arg in string.gmatch(message, "%S+") do
        table.insert(args, arg)
    end
    
    -- Check if we have enough arguments
    if #args < 5 then
        print("[" .. player.Name .. "] Usage: !activity team field increment player1,player2,... OR !activity team field increment all")
        return
    end
    
    -- Parse arguments
    local teamCode = string.lower(args[2])
    local field = args[3]
    local increment = tonumber(args[4])
    local playerList = args[5]
    
    -- Validate team
    if not teamConfig[teamCode] then
        print("[" .. player.Name .. "] Invalid team code. Available teams: " .. table.concat(tableKeys(teamConfig), ", "))
        return
    end
    
    local teamInfo = teamConfig[teamCode]
    
    -- Validate increment
    if not increment or increment <= 0 then
        print("[" .. player.Name .. "] Increment must be a positive number.")
        return
    end
    
    -- Process players
    local targetPlayers = {}
    
    if playerList:lower() == "all" then
        -- Get all players in the specified team
        targetPlayers = getTeamMembers(teamInfo.Team)
    else
        -- Parse comma-separated list
        for name in string.gmatch(playerList, "([^,]+)") do
            name = string.gsub(name, "^%s*(.-)%s*$", "%1") -- Trim whitespace
            local targetPlayer = Players:FindFirstChild(name)
            
            if targetPlayer and (not teamInfo.Team or targetPlayer.Team == teamInfo.Team) then
                table.insert(targetPlayers, targetPlayer)
            end
        end
    end
    
    -- Check if we found any players
    if #targetPlayers == 0 then
        print("[" .. player.Name .. "] No valid players found in team " .. teamInfo.FullName)
        return
    end
    
    -- Build request payload
    local payload = {invoker = player.Name, payloads = {}}
    for _, targetPlayer in ipairs(targetPlayers) do
        table.insert(payload.payloads, {
            name = targetPlayer.Name,
            department = teamInfo.Department,
            field = field,
            increment = increment
        })
    end
    print(HttpService:JSONEncode(payload))
    -- Send request to API
    local success, result = pcall(function()
        return HttpService:RequestAsync({
            Url = API_URL,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["Authorization"] = API_TOKEN
            },
            Body = HttpService:JSONEncode(payload)
        })
    end)
    
    -- Process response
    if success and result.Success then
        local responseData = HttpService:JSONDecode(result.Body)
        
        if responseData.success then
            local successfulUpdates = 0
            local failedUpdates = 0
            
            for _, updateResult in ipairs(responseData.results) do
                if updateResult.success then
                    successfulUpdates = successfulUpdates + 1
                else
                    failedUpdates = failedUpdates + 1
                end
            end
            
            print(string.format(
                "[%s] Activity recorded! Successfully updated %d player(s), %d failed.",
                player.Name, successfulUpdates, failedUpdates
            ))
        else
            print("[" .. player.Name .. "] Failed to record activity: " .. (responseData.message or "Unknown error"))
        end
    else
        print("[" .. player.Name .. "] Failed to connect to the activity tracking system. Please try again later.")
        warn("API Request Failed:", result)
    end
end

-- Chat command handler
local function onPlayerChatted(player, message)
    if string.sub(message, 1, 9):lower() == "!activity" then
        processActivityCommand(player, message)
    end
end

-- Connect to player chat events
local function setupChatListeners()
    for _, player in ipairs(Players:GetPlayers()) do
        player.Chatted:Connect(function(message)
            onPlayerChatted(player, message)
        end)
    end
    
    Players.PlayerAdded:Connect(function(player)
        player.Chatted:Connect(function(message)
            onPlayerChatted(player, message)
        end)
    end)
end

-- Helper function for getting table keys
function tableKeys(tbl)
    local keys = {}
    for k, _ in pairs(tbl) do
        table.insert(keys, k)
    end
    return keys
end

-- Initialize
setupChatListeners()

-- Export the module
local SpreadsheetRanker = {}

-- Expose the function for direct calling from other scripts if needed
function SpreadsheetRanker:ProcessCommand(player, message)
    if string.sub(message, 1, 9):lower() == "!activity" then
        processActivityCommand(player, message)
        return true
    end
    return false
end

return SpreadsheetRanker 