import { ASTNode, ASTNodeWithChildren } from "../../ast_node";
import { ContractKind } from "../../constants";
import { InheritanceSpecifier } from "../meta/inheritance_specifier";
import { SourceUnit } from "../meta/source_unit";
import { StructuredDocumentation } from "../meta/structured_documentation";
import { UsingForDirective } from "../meta/using_for_directive";
import { EnumDefinition } from "./enum_definition";
import { ErrorDefinition } from "./error_definition";
import { EventDefinition } from "./event_definition";
import { FunctionDefinition } from "./function_definition";
import { ModifierDefinition } from "./modifier_definition";
import { StructDefinition } from "./struct_definition";
import { VariableDeclaration } from "./variable_declaration";

export class ContractDefinition extends ASTNodeWithChildren<ASTNode> {
    private docString?: string;

    /**
     * The contract name
     */
    name: string;

    /**
     * The source range for name string
     */
    nameLocation?: string;

    /**
     *  Id of its scoped source unit
     */
    scope: number;

    /**
     * Type of contract declaration, e.g. `contract`, `library` or `interface`.
     */
    kind: ContractKind;

    /**
     * Is `true` if contract is declared as an abstract
     * (using `abstract` keyword since Solidity 0.6).
     *
     * Is `false` otherwise.
     */
    abstract: boolean;

    /**
     * Is `false` if one of the functions is not implemented.
     *
     * Is `true` otherwise.
     */
    fullyImplemented: boolean;

    /**
     * C3-linearized base contract ids including the current contract's id
     */
    linearizedBaseContracts: number[];

    /**
     * Used error definition ids (including external definition ids)
     */
    usedErrors: number[];

    constructor(
        id: number,
        src: string,
        type: string,
        name: string,
        scope: number,
        kind: ContractKind,
        abstract: boolean,
        fullyImplemented: boolean,
        linearizedBaseContracts: number[],
        usedErrors: number[],
        documentation?: string | StructuredDocumentation,
        children?: Iterable<ASTNode>,
        nameLocation?: string,
        raw?: any
    ) {
        super(id, src, type, raw);

        this.name = name;
        this.scope = scope;
        this.kind = kind;
        this.abstract = abstract;
        this.fullyImplemented = fullyImplemented;
        this.linearizedBaseContracts = linearizedBaseContracts;
        this.usedErrors = usedErrors;

        if (children) {
            for (const node of children) {
                this.appendChild(node);
            }
        }

        this.documentation = documentation;
        this.nameLocation = nameLocation;
    }

    /**
     * Optional documentation appearing above the contract definition:
     * - Is `undefined` when not specified.
     * - Is type of `string` when specified and compiler version is older than `0.6.3`.
     * - Is instance of `StructuredDocumentation` when specified and compiler version is `0.6.3` or newer.
     */
    get documentation(): string | StructuredDocumentation | undefined {
        if (this.docString !== undefined) {
            return this.docString;
        }

        return this.ownChildren.find((node) => node instanceof StructuredDocumentation) as
            | StructuredDocumentation
            | undefined;
    }

    set documentation(value: string | StructuredDocumentation | undefined) {
        const old = this.documentation;

        if (value instanceof StructuredDocumentation) {
            this.docString = undefined;

            if (old instanceof StructuredDocumentation) {
                if (value !== old) {
                    this.replaceChild(value, old);
                }
            } else {
                this.insertAtBeginning(value);
            }
        } else {
            if (old instanceof StructuredDocumentation) {
                this.removeChild(old);
            }

            this.docString = value;
        }
    }

    /**
     * Reference to its scoped source unit
     */
    get vScope(): SourceUnit {
        return this.requiredContext.locate(this.scope) as SourceUnit;
    }

    set vScope(value: SourceUnit) {
        if (!this.requiredContext.contains(value)) {
            throw new Error(`Node ${value.type}#${value.id} not belongs to a current context`);
        }

        this.scope = value.id;
    }

    /**
     * C3-linearized base contract references including the current contract
     */
    get vLinearizedBaseContracts(): readonly ContractDefinition[] {
        const context = this.requiredContext;

        return this.linearizedBaseContracts.map((id) => context.locate(id)) as ContractDefinition[];
    }

    /**
     * Used error definitions (including external definitions)
     */
    get vUsedErrors(): readonly ErrorDefinition[] {
        const context = this.requiredContext;

        return this.usedErrors.map((id) => context.locate(id)) as ErrorDefinition[];
    }

    /**
     * Inheritance specifiers
     */
    get vInheritanceSpecifiers(): readonly InheritanceSpecifier[] {
        return this.ownChildren.filter(
            (node) => node instanceof InheritanceSpecifier
        ) as InheritanceSpecifier[];
    }

    /**
     * State variables are `VariableDeclaration`s
     * that have the attribute `stateVariable` set to `true`
     * and that are direct children of a contract
     */
    get vStateVariables(): readonly VariableDeclaration[] {
        return this.ownChildren.filter(
            (node) => node instanceof VariableDeclaration
        ) as VariableDeclaration[];
    }

    /**
     * Modifiers of the contract
     */
    get vModifiers(): readonly ModifierDefinition[] {
        return this.ownChildren.filter(
            (node) => node instanceof ModifierDefinition
        ) as ModifierDefinition[];
    }

    /**
     * Events of the contract
     */
    get vEvents(): readonly EventDefinition[] {
        return this.ownChildren.filter(
            (node) => node instanceof EventDefinition
        ) as EventDefinition[];
    }

    /**
     * Errors of the contract
     */
    get vErrors(): readonly ErrorDefinition[] {
        return this.ownChildren.filter(
            (node) => node instanceof ErrorDefinition
        ) as ErrorDefinition[];
    }

    /**
     * Functions of the contract
     */
    get vFunctions(): readonly FunctionDefinition[] {
        return this.ownChildren.filter(
            (node) => node instanceof FunctionDefinition
        ) as FunctionDefinition[];
    }

    /**
     * Type-bound libraries directives of the contract
     */
    get vUsingForDirectives(): readonly UsingForDirective[] {
        return this.ownChildren.filter(
            (node) => node instanceof UsingForDirective
        ) as UsingForDirective[];
    }

    /**
     * Structs of the contract
     */
    get vStructs(): readonly StructDefinition[] {
        return this.ownChildren.filter(
            (node) => node instanceof StructDefinition
        ) as StructDefinition[];
    }

    /**
     * Enums of the contract
     */
    get vEnums(): readonly EnumDefinition[] {
        return this.ownChildren.filter(
            (node) => node instanceof EnumDefinition
        ) as EnumDefinition[];
    }

    /**
     * Constructor reference (if definition is present for this contract)
     */
    get vConstructor(): FunctionDefinition | undefined {
        return this.vFunctions.find((fn) => fn.isConstructor);
    }

    get interfaceId(): string | undefined {
        if (this.kind !== ContractKind.Interface) {
            return undefined;
        }

        if (this.vFunctions.length === 0) {
            return "00000000";
        }

        return this.vFunctions
            .map((fn) => BigInt("0x" + fn.canonicalSignatureHash))
            .reduce((a, b) => a ^ b)
            .toString(16)
            .padStart(8, "0");
    }

    /**
     * Returns `true` if `other` contract is present in the inheritance chain
     * of the current contract. Returns `false` otherwise.
     */
    isSubclassOf(other: ContractDefinition): boolean {
        return this.vLinearizedBaseContracts.includes(other);
    }
}
