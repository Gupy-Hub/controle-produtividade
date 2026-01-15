/**
 * NEXUS OPERACIONAL - UNIDADE DE ELITE
 * Módulo: Importação de Assertividade (Integridade Total)
 */

Gestao.Importacao.Assertividade = {
    async processarCSV(arquivo) {
        console.group("Auditoria Nexus: Processamento Assertividade");
        const statusEl = document.getElementById('status-importacao-assert');
        
        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const registros = results.data.map(linha => {
                    // Sanitização e Extração com fallback para nomes de colunas do seu CSV
                    const idAssistente = parseInt(linha['id_assistente'] || linha['ID ASSISTENTE']) || null;
                    const dataRef = this.formatarDataISO(linha['end_time'] || linha['Data da Auditoria ']);
                    
                    if (!idAssistente || !dataRef) return null;

                    return {
                        usuario_id: idAssistente,
                        data_referencia: dataRef,
                        empresa_id: parseInt(linha['Company_id'] || linha['ID Empresa']) || null,
                        empresa_nome: linha['Empresa'] || linha['Nome '],
                        nome_assistente: linha['Assistente'] || linha['NOME ASSIST'],
                        nome_documento: linha['doc_name'] || linha['DOCUMENTO'],
                        status: (linha['STATUS'] || '').toUpperCase(),
                        num_campos: parseInt(linha['nº Campos']) || 0,
                        qtd_ok: parseInt(linha['Ok']) || 0,
                        qtd_nok: parseInt(linha['Nok']) || 0,
                        porcentagem: linha['% Assert'] ? linha['% Assert'].replace(',', '.') : "0",
                        nome_auditora_raw: linha['Auditora'] || 'Sistema',
                        created_at: new Date().toISOString()
                    };
                }).filter(r => r !== null);

                await this.persitenciaIdempotente(registros, statusEl);
            }
        });
        console.groupEnd();
    },

    formatarDataISO(valor) {
        if (!valor) return null;
        try {
            // Se for ISO (end_time), extrai apenas a data
            if (valor.includes('T')) return valor.split('T')[0];
            // Se for DD/MM/YYYY
            if (valor.includes('/')) {
                const [d, m, y] = valor.split('/');
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return valor;
        } catch(e) { return null; }
    },

    async persitenciaIdempotente(dados, statusEl) {
        if (statusEl) statusEl.innerHTML = "Gravando dados com proteção contra duplicidade...";
        
        // Uso de upsert baseado na constraint de integridade
        const { error } = await Sistema.supabase
            .from('assertividade')
            .upsert(dados, { 
                onConflict: 'usuario_id, data_referencia, nome_documento', 
                ignoreDuplicates: false 
            });

        if (error) {
            console.error("Erro SRE:", error);
            alert("Falha na gravação: " + error.message);
        } else {
            alert(`Sucesso! ${dados.length} registros processados.`);
            if (Gestao.Assertividade.buscarDados) Gestao.Assertividade.buscarDados();
        }
    }
};