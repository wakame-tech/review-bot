export interface ReviewComment {
    path: string;
    line: number;
    body: string;
}

type FunctionParameterProperty = {
    type: string;
    description?: string;
    properties?: {
        [key: string]: FunctionParameterProperty;
    };
    required?: string[];
} | {
    type: "array";
    items: FunctionParameterProperty;
    required?: string[];
};

export type FunctionObject = {
    name: string;
    description: string;
    parameters: FunctionParameterProperty;
    function_call?: string;
};

type Role = "system" | "user" | "assistant" | "function";
export type Message = { role: Role; content: string; name?: string };

export type CompletionAPIResponse = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: Role;
            content: null | string;
            function_call: {
                name: string;
                arguments: string;
            };
        };
        finish_reason: "function_call" | "stop";
    }[];
};
