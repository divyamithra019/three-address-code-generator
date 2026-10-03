package com.example.backend;

import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/tac")
public class TacController {

    @PostMapping("/generate")
    public Map<String, Object> generate(
            @RequestBody Map<String, String> request) {

        String expression = request.get("expression");

        Map<String, Object> response = new HashMap<>();

        if (expression == null || expression.trim().isEmpty()) {
            response.put("success", false);
            response.put("error", "Expression cannot be empty.");
            return response;
        }

        try {
            String[] parts = expression.split("=", 2);

            if (parts.length != 2) {
                throw new Exception(
                        "Expression must follow the form: variable = expression"
                );
            }

            String variable = parts[0].trim();
            String rhs = parts[1].trim();

            if (variable.isEmpty() || rhs.isEmpty()) {
                throw new Exception("Invalid expression.");
            }

            List<String> tac = generateTAC(rhs, variable);

            response.put("success", true);
            response.put("expression", expression);
            response.put("tac", tac);

        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
        }

        return response;
    }

    private List<String> generateTAC(
            String expression,
            String variable) {

        List<String> tac = new ArrayList<>();

        List<String> tokens = tokenize(expression);

        List<String> postfix = toPostfix(tokens);

        Stack<String> stack = new Stack<>();

        int tempCount = 1;

        for (String token : postfix) {

            if (isUnaryOperator(token)) {

    String operand = stack.pop();

    String temp = "t" + tempCount++;

    tac.add(
            temp + " = " +
            token.substring(1) +
            operand
    );

    stack.push(temp);

} else if (isOperator(token)) {

    String right = stack.pop();
    String left = stack.pop();

    String temp = "t" + tempCount++;

    tac.add(
            temp + " = " +
            left + " " +
            token + " " +
            right
    );

    stack.push(temp);

} else {
    stack.push(token);
}
        }

        String result = stack.pop();

        tac.add(variable + " = " + result);

        return tac;
    }

    private List<String> tokenize(String expression) {

        List<String> tokens = new ArrayList<>();

        StringBuilder current = new StringBuilder();

        for (int i = 0; i < expression.length(); i++) {

            char ch = expression.charAt(i);

            if (Character.isWhitespace(ch)) {
                continue;
            }

            if (Character.isLetterOrDigit(ch)
                    || ch == '_'
                    || ch == '.') {

                current.append(ch);

            } else {

                if (current.length() > 0) {
                    tokens.add(current.toString());
                    current.setLength(0);
                }

                if ("+-*/%()".indexOf(ch) >= 0) {
                    tokens.add(String.valueOf(ch));
                } else {
                    throw new RuntimeException(
                            "Invalid character: " + ch
                    );
                }
            }
        }

        if (current.length() > 0) {
            tokens.add(current.toString());
        }

        return tokens;
    }

    private List<String> toPostfix(List<String> tokens) {

        List<String> output = new ArrayList<>();
        Stack<String> operators = new Stack<>();

       for (int i = 0; i < tokens.size(); i++) {

    String token = tokens.get(i);

    boolean unaryMinus =
            token.equals("-")
            && (i == 0
                || isOperator(tokens.get(i - 1))
                || tokens.get(i - 1).equals("("));

    if (unaryMinus) {
        token = "u-";
    }

           if (!isOperator(token)
        && !isUnaryOperator(token)
        && !token.equals("(")
        && !token.equals(")")) {

                output.add(token);

            } else if (token.equals("(")) {

                operators.push(token);

            } else if (token.equals(")")) {

                while (!operators.isEmpty()
                        && !operators.peek().equals("(")) {

                    output.add(operators.pop());
                }

                if (operators.isEmpty()) {
                    throw new RuntimeException(
                            "Missing opening parenthesis."
                    );
                }

                operators.pop();

            } else {

                while (!operators.isEmpty()
                        && !operators.peek().equals("(")
                        && precedence(operators.peek())
                           >= precedence(token)) {

                    output.add(operators.pop());
                }

                operators.push(token);
            }
        }

        while (!operators.isEmpty()) {

            if (operators.peek().equals("(")) {
                throw new RuntimeException(
                        "Missing closing parenthesis."
                );
            }

            output.add(operators.pop());
        }

        return output;
    }

    private boolean isOperator(String token) {

        return token.equals("+")
                || token.equals("-")
                || token.equals("*")
                || token.equals("/")
                || token.equals("%");
    }
    private boolean isUnaryOperator(String token) {

    return token.equals("u-");
}

    private int precedence(String operator) {
        if (operator.equals("u-")) {
    return 3;
}

        if (operator.equals("*")
                || operator.equals("/")
                || operator.equals("%")) {
            return 2;
        }

        if (operator.equals("+")
                || operator.equals("-")) {
            return 1;
        }

        return 0;
    }
}